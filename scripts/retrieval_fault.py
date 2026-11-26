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
    ipv4 = commands.call([*curl, runtime.PROBES["trace_ipv4"]], 4, until)
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
            runtime.PROBES["resolver_ipv4"],
        ],
        4,
        until,
    )
    ipv6 = commands.call([*curl, "--ipv6", runtime.PROBES["trace_ipv6"]], 4, until)
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


@dataclass
class Card:
    """Carry one campaign's identity, shared budget and report between its phases."""

    mount: Path
    identity: str
    commands: Commands
    normal_end: float
    clock: Callable[[], float]
    sleep: Callable[[float], None]
    report: dict[str, object]

    @property
    def root(self) -> Path:
        """Return the owned installation directory of the campaign."""
        return self.mount / "retrieval"


def running_ids(card: Card, reason: str) -> tuple[str, str]:
    """Return the client and gateway IDs of the proven pair, both running."""
    rows = json.loads(json.dumps(owned(card.identity, card.commands, card.normal_end)))
    if set(rows) != {"client", "gluetun"} or not all(
        item["State"]["Running"] is True for item in rows.values()
    ):
        raise Refusal(reason)
    return rows["client"]["Id"], rows["gluetun"]["Id"]


def observe_denial(
    card: Card, client: str, gateway: str, original_namespace: str, fault_started: float
) -> None:
    """Sample three times that the client stays alive, in place and denied."""
    fault_end = min(card.normal_end, fault_started + 30)
    for sample in range(3):
        delay = fault_started + sample * 5 - card.clock()
        if delay > 0:
            if card.clock() + delay >= fault_end:
                raise Refusal("fault_budget_exhausted")
            card.sleep(delay)
        current = json.loads(json.dumps(owned(card.identity, card.commands, fault_end)))
        if (
            current["gluetun"]["Id"] != gateway
            or current["gluetun"]["State"]["Running"] is not False
            or current["client"]["Id"] != client
            or current["client"]["State"]["Running"] is not True
            or namespace(client, card.commands, fault_end) != original_namespace
        ):
            raise Refusal("fault_state_not_observed")
        card.report["fault_observed"] = True
        probes(client, card.commands, fault_end, connected=False)
        card.report["denial_samples"] = sample + 1
    card.report["fault_observation_seconds"] = round(card.clock() - fault_started, 3)


def inject_fault(card: Card) -> tuple[str, str]:
    """Kill the proven gateway once, under the lock, and observe the denial."""
    with runtime.locked(card.root):
        if runtime.installation_manifest(card.root)["identity"] != card.identity:
            raise Refusal("fault_installation_changed")
        client, gateway = running_ids(card, "fault_pair_not_running")
        original_namespace = namespace(client, card.commands, card.normal_end)
        probes(client, card.commands, card.normal_end, connected=True)
        if card.normal_end - card.clock() < 170:
            raise Refusal("fault_recovery_budget_insufficient")
        # Mark uncertainty before sending the mutation: a timed-out request may still act.
        card.report["fault_attempted"] = True
        card.commands.need(
            ["docker", "kill", "--signal", "KILL", gateway], 5, card.normal_end
        )
        observe_denial(card, client, gateway, original_namespace, card.clock())
    return client, gateway


def confirm_recovery(card: Card, client: str, gateway: str) -> None:
    """Require a recreated, running and connected pair after the owned restart."""
    with runtime.locked(card.root):
        recovered_client, recovered_gateway = running_ids(
            card, "fault_recovery_unconfirmed"
        )
        if recovered_client == client or recovered_gateway == gateway:
            raise Refusal("fault_recovery_not_recreated")
        probes(recovered_client, card.commands, card.normal_end, connected=True)


def failure_reason(error: BaseException) -> str:
    """Reduce a campaign failure to its fixed category."""
    if isinstance(error, Refusal):
        return str(error)
    if isinstance(error, KeyboardInterrupt):
        return "fault_interrupted"
    return "fault_observation_unavailable"


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
    card = Card(mount, identity, commands, normal_end, clock, sleep, report)
    started = commands.end - WINDOW
    report["started_at"] = datetime.now(UTC).isoformat()
    try:
        controller("status", mount, commands, normal_end)
        client, gateway = inject_fault(card)
        controller("start", mount, commands, normal_end)
        confirm_recovery(card, client, gateway)
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
        report["reason"] = failure_reason(error)
        if report["fault_attempted"]:
            report["rollback_stopped"] = emergency_stop(root, identity, commands)
    report["elapsed_seconds"] = round(clock() - started, 3)
    return report


def interrupted(signum: int, frame: object) -> None:
    """Make termination enter the existing rollback path rather than abandon a fault."""
    raise Refusal("fault_interrupted")


def guarded_campaign(storage: Path | None) -> dict[str, object] | None:
    """Run the card from a clean source tree; None means refused before the campaign."""
    try:
        if storage is None:
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
            report = campaign(storage, runtime.ROOT / SCOPE)
        finally:
            signal.signal(signal.SIGTERM, previous)
        report["source_commit"] = source
        return report
    except (
        Refusal,
        OSError,
        ValueError,
        KeyError,
        TypeError,
        subprocess.SubprocessError,
    ):
        return None


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
    report = guarded_campaign(args.storage)
    if report is None:
        # The traceback is deliberately not logged: diagnostics stay categorical.
        LOGGER.error("retrieval.fault_refused_before_campaign")
        return 1
    print(json.dumps(report))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
