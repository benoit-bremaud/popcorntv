"""Prepare or run only the explicitly approved R328-F01 empty gateway-exit experiment."""

from __future__ import annotations

import argparse
import json
import logging
import os
import signal
import subprocess
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import local_retrieval as runtime
from retrieval_config import Refusal, private_file

CARD = "R328-F01"
WINDOW = 300
ROLLBACK_RESERVE = 60
PROCESS_CLEANUP_RESERVE = 2.0
LOGGER = logging.getLogger("retrieval.fault")
# Owner-written private fault scope, under the ignored data tree: never the pentest
# campaign scope of docs/security/, and never authored by the executor.
SCOPE = Path("data/local-retrieval/fault-scope.json")
Process = Callable[[list[str], float], subprocess.CompletedProcess[str]]


def terminate_group(child: subprocess.Popen[str]) -> None:
    """Reap only the private process group created for this invocation."""
    for action in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(child.pid, action)
        except ProcessLookupError:
            pass
        try:
            child.communicate(timeout=1)
        except subprocess.TimeoutExpired:
            continue
    if child.returncode is None:
        raise Refusal("fault_process_cleanup_unconfirmed")


def process(arguments: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    """Bound the whole controller process group; retain output only in caller memory."""
    with subprocess.Popen(
        arguments,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    ) as child:
        try:
            stdout, stderr = child.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            terminate_group(child)
            raise Refusal("fault_process_timeout") from None
        except BaseException:
            # Cancellation must not leave a controller holding the installation lock.
            terminate_group(child)
            raise
        return subprocess.CompletedProcess(arguments, child.returncode, stdout, stderr)


@dataclass
class Commands:
    """Share one monotonic budget while substituting only the external process boundary."""

    end: float
    clock: Callable[[], float] = time.monotonic
    execute: Process = process

    def call(
        self, arguments: list[str], limit: float, until: float
    ) -> subprocess.CompletedProcess[str]:
        """Reserve group cleanup inside the phase budget; limit bounds execution alone."""
        remaining = min(self.end, until) - self.clock()
        if remaining <= PROCESS_CLEANUP_RESERVE:
            raise Refusal("fault_budget_exhausted")
        try:
            result = self.execute(
                arguments, min(limit, remaining - PROCESS_CLEANUP_RESERVE)
            )
            if self.clock() > min(self.end, until):
                raise Refusal("fault_budget_exhausted")
            return result
        except OSError:
            raise Refusal("fault_process_unavailable") from None

    def need(self, arguments: list[str], limit: float, until: float) -> str:
        """Turn failures into categories without exposing upstream text or command arguments."""
        result = self.call(arguments, limit, until)
        if result.returncode:
            raise Refusal("fault_command_failed")
        return result.stdout


def approved_scope(path: Path, identity: str, now: datetime) -> None:
    """Require an owner-authored private, exact-card JSON subset of YAML; never write it."""
    try:
        scope = json.loads(private_file(path))
        if not isinstance(scope, dict) or scope != {
            "card": CARD,
            "environment": "local",
            "installation_identity": identity,
            "owner_confirmed": True,
            "allow_abrupt_gateway_exit": True,
            "allow_owned_recovery": True,
            "max_seconds": WINDOW,
            "expires_at": scope.get("expires_at"),
        }:
            raise Refusal("fault_scope_unconfirmed")
        if (
            type(scope["owner_confirmed"]) is not bool
            or type(scope["allow_abrupt_gateway_exit"]) is not bool
            or type(scope["allow_owned_recovery"]) is not bool
            or type(scope["max_seconds"]) is not int
            or not isinstance(scope["expires_at"], str)
        ):
            raise Refusal("fault_scope_unconfirmed")
        expiry = datetime.fromisoformat(scope["expires_at"])
        if expiry.tzinfo is None or not now + timedelta(
            seconds=WINDOW
        ) <= expiry <= now + timedelta(days=1):
            raise Refusal("fault_scope_expired_or_unbounded")
    except (ValueError, KeyError, TypeError, OSError):
        raise Refusal("fault_scope_invalid") from None


def owned(
    identity: str, commands: Commands, until: float
) -> dict[str, dict[str, object]]:
    """Reuse the production ownership proof with a deadline-bound process adapter."""
    rows = runtime.inspect_owned(
        identity, reader=lambda args: commands.need(args, 5, until)
    )
    return {str(item["Name"]).rsplit("-", 1)[-1]: item for item in rows}


def namespace(identifier: str, commands: Commands, until: float) -> str:
    """Observe the client's namespace without exposing its identifier in the report."""
    value = commands.need(
        ["docker", "exec", identifier, "readlink", "/proc/1/ns/net"], 5, until
    ).strip()
    if not value.startswith("net:[") or not value.endswith("]"):
        raise Refusal("fault_namespace_unavailable")
    return value


def probes(
    client: str,
    commands: Commands,
    until: float,
    *,
    connected: bool,
    require_dns_timeout: bool = False,
) -> None:
    """Use the same bounded IPv4/DNS probes before/during/after; IPv6 stays disabled."""
    curl = [
        "docker",
        "exec",
        client,
        "curl",
        "--silent",
        "--fail",
        "--connect-timeout",
        "2",
        "--max-time",
        "3",
        "--output",
        "/dev/null",
    ]
    ipv4 = commands.call([*curl, "https://1.1.1.1/cdn-cgi/trace"], 4, until)
    dns = commands.call(
        [
            "docker",
            "exec",
            client,
            "/bin/busybox",
            "timeout",
            "-s",
            "KILL",
            "2",
            "/bin/busybox",
            "nslookup",
            "example.com",
            "1.1.1.1",
        ],
        4,
        until,
    )
    ipv6 = commands.call(
        [*curl, "--ipv6", "https://[2606:4700:4700::1111]/cdn-cgi/trace"], 4, until
    )
    disabled = commands.need(
        ["docker", "exec", client, "cat", "/proc/sys/net/ipv6/conf/all/disable_ipv6"],
        5,
        until,
    ).strip()
    if connected:
        passed = ipv4.returncode == 0 and dns.returncode == 0
    else:
        # BusyBox can return 1 after receiving a negative DNS reply. F02
        # requires its own in-container timeout to classify DNS as denied.
        dns_denials = {137} if require_dns_timeout else {1, 137}
        passed = ipv4.returncode in {7, 28} and dns.returncode in dns_denials
    if not passed or ipv6.returncode not in {7, 28} or disabled != "1":
        raise Refusal("fault_probe_expectation_failed")


def controller(operation: str, mount: Path, commands: Commands, until: float) -> None:
    """Invoke the unchanged production CLI with bounded group lifetime and categorical output."""
    commands.need(
        [
            sys.executable,
            str(runtime.ROOT / "scripts/local_retrieval.py"),
            operation,
            "--storage",
            str(mount),
        ],
        150 if operation == "start" else 45,
        until,
    )


def emergency_stop(root: Path, identity: str, commands: Commands) -> bool:
    """Attempt both proven IDs within the reserved budget; never claim an unobserved stop."""
    confirmed = True
    try:
        with runtime.locked(root):
            rows = owned(identity, commands, commands.end)
            for role in ("client", "gluetun"):
                item = rows.get(role)
                if item is None:
                    continue
                try:
                    identifier = str(item["Id"])
                    commands.need(
                        ["docker", "stop", "--time", "10", identifier], 12, commands.end
                    )
                    current = json.loads(
                        commands.need(
                            ["docker", "inspect", identifier], 3, commands.end
                        )
                    )
                    if (
                        len(current) != 1
                        or current[0].get("Id") != identifier
                        or current[0].get("State", {}).get("Running") is not False
                    ):
                        confirmed = False
                except (Refusal, ValueError, TypeError, KeyError, AttributeError):
                    confirmed = False
    except (Refusal, OSError, ValueError, TypeError, KeyError, AttributeError):
        confirmed = False
    return confirmed


def campaign(
    mount: Path,
    scope: Path,
    *,
    execute: Process = process,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, object]:
    """Run one empty abrupt-exit card; no retry, no other fault, no real transfer."""
    root = mount / "retrieval"
    manifest = runtime.installation_manifest(root)
    identity = str(manifest["identity"])
    approved_scope(scope, identity, datetime.now(UTC))
    commands = Commands(clock() + WINDOW, clock, execute)
    normal_end = commands.end - ROLLBACK_RESERVE
    report: dict[str, object] = {
        "card": CARD,
        "passed": False,
        "fault_attempted": False,
        "fault_observed": False,
        "denial_samples": 0,
        "recovered": False,
    }
    attempted = False
    fault_started: float | None = None
    started = commands.end - WINDOW
    report["started_at"] = datetime.now(UTC).isoformat()
    try:
        controller("status", mount, commands, normal_end)
        with runtime.locked(root):
            if runtime.installation_manifest(root)["identity"] != identity:
                raise Refusal("fault_installation_changed")
            rows = json.loads(json.dumps(owned(identity, commands, normal_end)))
            if set(rows) != {"client", "gluetun"} or not all(
                item["State"]["Running"] is True for item in rows.values()
            ):
                raise Refusal("fault_pair_not_running")
            client, gateway = rows["client"]["Id"], rows["gluetun"]["Id"]
            original_namespace = namespace(client, commands, normal_end)
            probes(client, commands, normal_end, connected=True)
            if normal_end - clock() < 170:
                raise Refusal("fault_recovery_budget_insufficient")
            # Mark uncertainty before sending the mutation: a timed-out request may still act.
            attempted = True
            report["fault_attempted"] = True
            commands.need(
                ["docker", "kill", "--signal", "KILL", gateway], 5, normal_end
            )
            fault_started = clock()
            fault_end = min(normal_end, fault_started + 30)
            for sample in range(3):
                delay = fault_started + sample * 5 - clock()
                if delay > 0:
                    if clock() + delay >= fault_end:
                        raise Refusal("fault_budget_exhausted")
                    sleep(delay)
                current = json.loads(json.dumps(owned(identity, commands, fault_end)))
                if (
                    current["gluetun"]["Id"] != gateway
                    or current["gluetun"]["State"]["Running"] is not False
                    or current["client"]["Id"] != client
                    or current["client"]["State"]["Running"] is not True
                    or namespace(client, commands, fault_end) != original_namespace
                ):
                    raise Refusal("fault_state_not_observed")
                report["fault_observed"] = True
                probes(client, commands, fault_end, connected=False)
                report["denial_samples"] = sample + 1
            report["fault_observation_seconds"] = round(clock() - fault_started, 3)
        controller("start", mount, commands, normal_end)
        with runtime.locked(root):
            recovered = json.loads(json.dumps(owned(identity, commands, normal_end)))
            if set(recovered) != {"client", "gluetun"} or not all(
                item["State"]["Running"] is True for item in recovered.values()
            ):
                raise Refusal("fault_recovery_unconfirmed")
            if (
                recovered["client"]["Id"] == client
                or recovered["gluetun"]["Id"] == gateway
            ):
                raise Refusal("fault_recovery_not_recreated")
            probes(recovered["client"]["Id"], commands, normal_end, connected=True)
        report.update(passed=True, recovered=True)
    except (
        Refusal,
        OSError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
        KeyboardInterrupt,
    ) as error:
        report["reason"] = (
            str(error)
            if isinstance(error, Refusal)
            else "fault_interrupted"
            if isinstance(error, KeyboardInterrupt)
            else "fault_observation_unavailable"
        )
        if attempted:
            report["rollback_stopped"] = emergency_stop(root, identity, commands)
    report["elapsed_seconds"] = round(clock() - started, 3)
    return report


def interrupted(signum: int, frame: object) -> None:
    """Make termination enter the existing rollback path rather than abandon a fault."""
    raise Refusal("fault_interrupted")


def main() -> int:
    """Default to the reviewable plan; active execution needs owner scope and explicit flag."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--storage", type=Path)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        print(
            json.dumps(
                {
                    "card": CARD,
                    "window_seconds": WINDOW,
                    "fault": "one abrupt exit of the proven owned gateway ID",
                    "samples": 3,
                    "rollback_reserve_seconds": ROLLBACK_RESERVE,
                    "execution": "not performed",
                }
            )
        )
        return 0
    try:
        if args.storage is None:
            raise Refusal("fault_storage_required")
        status = subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=runtime.ROOT, text=True, timeout=5
        )
        if status.strip():
            raise Refusal("fault_clean_source_required")
        source = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=runtime.ROOT, text=True, timeout=5
        ).strip()
        previous = signal.signal(signal.SIGTERM, interrupted)
        try:
            report = campaign(args.storage, runtime.ROOT / SCOPE)
        finally:
            signal.signal(signal.SIGTERM, previous)
        report["source_commit"] = source
        print(json.dumps(report))
        return 0 if report["passed"] else 1
    except (
        Refusal,
        OSError,
        ValueError,
        KeyError,
        TypeError,
        subprocess.SubprocessError,
    ):
        LOGGER.error("retrieval.fault_refused_before_campaign")
        return 1


if __name__ == "__main__":
    sys.exit(main())
