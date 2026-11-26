"""Run the bounded WireGuard endpoint interruption card with owned recovery."""

from __future__ import annotations

import argparse
import configparser
import ipaddress
import json
import re
import signal
import subprocess
import sys
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

import local_retrieval as runtime
from retrieval_config import Refusal, WireGuardParser, private_file, wireguard_text
from retrieval_fault import (
    ROLLBACK_RESERVE,
    SCOPE,
    WINDOW,
    Card,
    Commands,
    Process,
    controller,
    emergency_stop,
    interrupted,
    namespace,
    owned,
    probes,
    process,
)

CARD = "R328-F02"
RULE_LIFETIME = 30
SAMPLE_WINDOW = 24


@dataclass(frozen=True)
class PeerTarget:
    """Canonical UDP destination and proved egress interface kept in caller memory."""

    address: ipaddress.IPv4Address = field(repr=False)
    port: int = field(repr=False)
    interface: str
    mark: str | None = field(default=None, repr=False)


def observe_target(
    root: Path, gateway: str, commands: Commands, until: float
) -> PeerTarget:
    """Refuse an unavailable, changed or ambiguous peer before any rule can be armed.

    The caller must hold the installation lock and have proved the immutable gateway
    ID and its effective container policy. This function only reads observations.
    """
    config = WireGuardParser(interpolation=None)
    try:
        config.read_string(wireguard_text(private_file(root / runtime.WIREGUARD_FILE)))
        peer = config["Peer"]
        address_text, port_text = peer["Endpoint"].rsplit(":", 1)
        address = ipaddress.IPv4Address(address_text)
        port = int(port_text)
    except (configparser.Error, OSError, ValueError, KeyError):
        raise Refusal("f02_peer_config_unavailable") from None

    prefix = ["docker", "exec", gateway]
    try:
        active = commands.need([*prefix, "wg", "show", "tun0", "endpoints"], 4, until)
        mark = commands.need([*prefix, "wg", "show", "tun0", "fwmark"], 4, until)
    except Refusal:
        raise Refusal("f02_peer_observation_unavailable") from None
    mark = mark.strip()
    if active.split() != [peer["PublicKey"], peer["Endpoint"]] or (
        mark != "off" and not re.fullmatch(r"0x[1-9a-f][0-9a-f]{0,7}", mark)
    ):
        raise Refusal("f02_peer_or_mark_mismatch")

    # Resolve the route used by WireGuard's socket, including its policy mark.
    route_arguments = [*prefix, "ip", "-4", "route", "get", str(address)]
    if mark != "off":
        route_arguments.extend(["mark", mark])
    route = commands.need(route_arguments, 4, until)
    tokens = route.split()
    devices = re.findall(r"\bdev\s+([^\s]+)", route)
    if not tokens or tokens[0] != str(address) or devices != ["eth0"]:
        raise Refusal("f02_endpoint_route_unconfirmed")

    version = commands.need([*prefix, "iptables", "--version"], 4, until)
    rules = commands.need([*prefix, "iptables", "-w", "2", "-S", "OUTPUT"], 4, until)
    if not re.fullmatch(r"iptables v[0-9.]+ \(nf_tables\)", version.strip()) or (
        "-P OUTPUT DROP" not in rules.splitlines()
    ):
        raise Refusal("f02_firewall_backend_unconfirmed")
    return PeerTarget(address, port, devices[0], None if mark == "off" else mark)


@dataclass(frozen=True)
class RunningPair:
    """Snapshot identifying both running processes and their shared namespace."""

    gateway: str
    client: str
    network: str
    gateway_started: str
    client_started: str


def running_pair(identity: str, commands: Commands, until: float) -> RunningPair:
    """Require both proved containers to remain in the same network namespace."""
    rows = json.loads(json.dumps(owned(identity, commands, until)))
    if set(rows) != {"gluetun", "client"} or any(
        item["State"]["Running"] is not True for item in rows.values()
    ):
        raise Refusal("f02_pair_not_running")
    gateway, client = rows["gluetun"]["Id"], rows["client"]["Id"]
    network = namespace(gateway, commands, until)
    if namespace(client, commands, until) != network:
        raise Refusal("f02_namespace_changed")
    gateway_started, client_started = (
        rows[role]["State"].get("StartedAt") for role in ("gluetun", "client")
    )
    if not all(
        isinstance(stamp, str) and stamp for stamp in (gateway_started, client_started)
    ):
        raise Refusal("f02_process_generation_unavailable")
    return RunningPair(gateway, client, network, gateway_started, client_started)


@dataclass(frozen=True)
class RuleTrial:
    """Address only one trial inside the proved gateway container."""

    gateway: str
    target: PeerTarget
    tag: str
    cutoff: str
    script: str

    def arguments(self, operation: str) -> list[str]:
        """Pass typed input positionally to the fixed in-container helper."""
        prefix = ["docker", "exec"]
        if operation == "arm":
            prefix.append("-d")
        return [
            *prefix,
            self.gateway,
            "/bin/sh",
            "-c",
            self.script,
            "f02-rule",
            operation,
            self.tag,
            self.target.interface,
            f"{self.target.address}/32",
            str(self.target.port),
            self.cutoff,
            str(RULE_LIFETIME - 4),
        ]

    def packets(self, commands: Commands, until: float) -> int:
        """Read the counter of the exact, still-open trial rule."""
        output = commands.need(self.arguments("observe"), 5, until).strip()
        if not re.fullmatch(r"\d{1,20}", output, re.ASCII):
            raise Refusal("f02_rule_counter_unconfirmed")
        return int(output)


def approved_scope(path: Path, identity: str, now: datetime) -> None:
    """Require an exact, privately owner-confirmed authorization for F02 alone."""
    try:
        scope = json.loads(private_file(path))
        if not isinstance(scope, dict) or scope != {
            "card": CARD,
            "environment": "local",
            "installation_identity": identity,
            "owner_confirmed": True,
            "allow_endpoint_drop": True,
            "allow_owned_stop": True,
            "max_seconds": WINDOW,
            "expires_at": scope.get("expires_at"),
        }:
            raise Refusal("f02_scope_unconfirmed")
        if (
            any(
                type(scope[key]) is not bool
                for key in (
                    "owner_confirmed",
                    "allow_endpoint_drop",
                    "allow_owned_stop",
                )
            )
            or type(scope["max_seconds"]) is not int
        ):
            raise Refusal("f02_scope_unconfirmed")
        expiry = datetime.fromisoformat(scope["expires_at"])
        if expiry.tzinfo is None or not now + timedelta(
            seconds=WINDOW
        ) <= expiry <= now + timedelta(days=1):
            raise Refusal("f02_scope_expired_or_unbounded")
    except (OSError, ValueError, KeyError, TypeError):
        raise Refusal("f02_scope_invalid") from None


def preflight_target(card: Card, pair: RunningPair) -> PeerTarget:
    """Re-prove the installation, the pair and the peer before any rule is armed."""
    if runtime.installation_manifest(card.root)["identity"] != card.identity:
        raise Refusal("f02_installation_changed")
    if running_pair(card.identity, card.commands, card.normal_end) != pair:
        raise Refusal("f02_preflight_generation_changed")
    target = observe_target(card.root, pair.gateway, card.commands, card.normal_end)
    probes(pair.client, card.commands, card.normal_end, connected=True)
    if card.normal_end - card.clock() < RULE_LIFETIME + 65:
        raise Refusal("f02_recovery_budget_insufficient")
    return target


def observe_drops(
    card: Card,
    pair: RunningPair,
    target: PeerTarget,
    trial: RuleTrial,
    samples: list[dict[str, object]],
    rule_start: float,
) -> None:
    """Insert the rule and require three denial batches with a growing counter."""
    observation_end = rule_start + SAMPLE_WINDOW
    card.commands.need(trial.arguments("insert"), 5, observation_end)
    card.report["phase"] = "observation"
    previous = trial.packets(card.commands, observation_end)
    for _ in range(3):
        if running_pair(card.identity, card.commands, observation_end) != pair:
            raise Refusal("f02_generation_changed")
        if (
            observe_target(card.root, pair.gateway, card.commands, observation_end)
            != target
        ):
            raise Refusal("f02_target_changed")
        probes(
            pair.client,
            card.commands,
            observation_end,
            connected=False,
            require_dns_timeout=True,
        )
        current = trial.packets(card.commands, observation_end)
        if current <= previous:
            raise Refusal("f02_no_observed_packet_drop")
        samples.append(
            {
                "seconds": round(card.clock() - rule_start, 3),
                "packet_counter_delta": current - previous,
            }
        )
        previous = current


def close_rule(card: Card, trial: RuleTrial, observation_failed: bool) -> None:
    """Remove the trial rule; an unconfirmed removal never hides the first failure."""
    try:
        card.commands.need(trial.arguments("close"), 16, card.commands.end)
    except (Refusal, OSError, KeyboardInterrupt):
        card.report["cleanup_reason"] = "f02_rule_removal_unconfirmed"
        if not observation_failed:
            raise
    else:
        card.report["rule_removed"] = True


def interrupt_endpoint(
    card: Card,
    pair: RunningPair,
    target: PeerTarget,
    script: str,
    samples: list[dict[str, object]],
) -> None:
    """Arm the self-expiring trial, drop the endpoint traffic, then close the rule."""
    rule_start = card.clock()
    cutoff = datetime.now(UTC) + timedelta(seconds=RULE_LIFETIME)
    trial = RuleTrial(
        pair.gateway,
        target,
        "pctv-f02-" + uuid.uuid4().hex,
        cutoff.strftime("%Y-%m-%dT%H:%M:%S"),
        script,
    )
    observation_end = rule_start + SAMPLE_WINDOW
    card.report["phase"] = "arming"
    card.commands.need(trial.arguments("arm"), 4, observation_end)
    ready_end = min(observation_end, card.clock() + 3)
    while card.commands.call(trial.arguments("ready"), 2, ready_end).returncode != 0:
        card.sleep(0.1)
    observation_failed = False
    try:
        # Mark uncertainty before sending the mutation: a timed-out request may still act.
        card.report.update(phase="insertion", attempted=True)
        observe_drops(card, pair, target, trial, samples, rule_start)
    except BaseException:
        observation_failed = True
        raise
    finally:
        close_rule(card, trial, observation_failed)


def campaign(
    mount: Path,
    scope: Path,
    *,
    execute: Process = process,
    clock: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, object]:
    """Require an observed packet drop, three denial batches and same-generation recovery."""
    root = mount / "retrieval"
    identity = str(runtime.installation_manifest(root)["identity"])
    started_at = datetime.now(UTC)
    approved_scope(scope, identity, started_at)
    script = (runtime.ROOT / "scripts/retrieval-f02-rule.sh").read_text()
    started = clock()
    commands = Commands(started + WINDOW, clock, execute)
    normal_end = commands.end - ROLLBACK_RESERVE
    samples: list[dict[str, object]] = []
    report: dict[str, object] = {
        "card": CARD,
        "started_at": started_at.isoformat(),
        "passed": False,
        "phase": "preflight",
        "attempted": False,
        "denial_samples": samples,
        "rule_removed": False,
        "recovered": False,
    }
    card = Card(mount, identity, commands, normal_end, clock, sleep, report)
    try:
        with runtime.locked(root):
            pair = running_pair(identity, commands, normal_end)
        controller("status", mount, commands, normal_end)
        with runtime.locked(root):
            target = preflight_target(card, pair)
            interrupt_endpoint(card, pair, target, script, samples)
            report["phase"] = "recovery"
            if running_pair(identity, commands, normal_end) != pair:
                raise Refusal("f02_generation_changed")
            probes(pair.client, commands, normal_end, connected=True)
        controller("status", mount, commands, normal_end)
        with runtime.locked(root):
            if running_pair(identity, commands, normal_end) != pair:
                raise Refusal("f02_generation_changed")
        report.update(phase="complete", passed=True, recovered=True)
    except (
        Refusal,
        OSError,
        ValueError,
        KeyError,
        TypeError,
        AttributeError,
        KeyboardInterrupt,
    ) as exc:
        report["reason"] = (
            str(exc) if isinstance(exc, Refusal) else "f02_observation_unavailable"
        )
        if report["attempted"]:
            report["rollback_stopped"] = emergency_stop(root, identity, commands)
    report["elapsed_seconds"] = round(clock() - started, 3)
    return report


def main() -> int:
    """Print the plan by default, or enforce exact scope before the live campaign."""
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
                    "rule_seconds": RULE_LIFETIME,
                    "samples": 3,
                    "execution": "not performed",
                }
            )
        )
        return 0
    try:
        if args.storage is None:
            raise Refusal("f02_storage_required")

        def git(*arguments: str) -> str:
            return subprocess.check_output(
                ["git", *arguments], cwd=runtime.ROOT, text=True, timeout=5
            ).strip()

        if git("status", "--porcelain"):
            raise Refusal("f02_clean_source_required")
        source = git("rev-parse", "HEAD")
        previous = signal.signal(signal.SIGTERM, interrupted)
        try:
            report = campaign(args.storage, runtime.ROOT / SCOPE)
        finally:
            signal.signal(signal.SIGTERM, previous)
        report["source_commit"] = source
        print(json.dumps(report))
        return 0 if report["passed"] else 1
    except (Refusal, OSError, ValueError, subprocess.SubprocessError):
        print("retrieval.f02_refused_before_campaign", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
