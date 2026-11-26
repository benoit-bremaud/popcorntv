"""Check that ambiguity in the gateway observations prevents a fault target."""

from __future__ import annotations

import base64
import ipaddress
import json
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import retrieval_f02
from retrieval_config import Refusal, write_private
from retrieval_f02 import PeerTarget, campaign, observe_target
from retrieval_fault import Commands
from test_retrieval_fault import IDENTITY, Docker

PUBLIC_KEY = base64.b64encode(b"a" * 32).decode()
PRIVATE_KEY = base64.b64encode(b"b" * 32).decode()
GATEWAY = "b" * 64
ENDPOINT = "9.9.9.9:51820"
OBSERVATIONS = {
    ("wg", "show", "tun0", "endpoints"): f"{PUBLIC_KEY}\t{ENDPOINT}\n",
    ("wg", "show", "tun0", "fwmark"): "off\n",
    (
        "ip",
        "-4",
        "route",
        "get",
        "9.9.9.9",
    ): "9.9.9.9 via 172.20.1.1 dev eth0\n    cache\n",
    ("iptables", "--version"): "iptables v1.8.13 (nf_tables)\n",
    ("iptables", "-w", "2", "-S", "OUTPUT"): "-P OUTPUT DROP\n",
}


@pytest.fixture
def root(tmp_path: Path) -> Path:
    write_private(
        tmp_path / "wg0.conf",
        f"[Interface]\nPrivateKey = {PRIVATE_KEY}\nAddress = 10.0.0.3/32\n"
        f"[Peer]\nPublicKey = {PUBLIC_KEY}\nEndpoint = {ENDPOINT}\nAllowedIPs = 0.0.0.0/0\n",
    )
    return tmp_path


def test_observation_uses_only_the_proved_gateway_and_read_only_commands(
    root: Path,
) -> None:
    calls: list[tuple[str, ...]] = []

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        assert args[:3] == ["docker", "exec", GATEWAY]
        assert timeout == 4
        command = tuple(args[3:])
        calls.append(command)
        return subprocess.CompletedProcess(args, 0, OBSERVATIONS[command], "")

    target = observe_target(root, GATEWAY, Commands(60, lambda: 0, execute), 30)
    assert target == PeerTarget(ipaddress.IPv4Address("9.9.9.9"), 51820, "eth0")
    assert calls == list(OBSERVATIONS)
    assert "9.9.9.9" not in repr(target)


@pytest.mark.parametrize(
    ("operation", "output", "exit_code", "reason"),
    [
        (0, "wireguard binary unavailable", 127, "f02_peer_observation_unavailable"),
        (0, f"{PUBLIC_KEY} 9.9.9.9:12345", 0, "f02_peer_or_mark_mismatch"),
        (
            0,
            f"{PUBLIC_KEY} {ENDPOINT}\n{PUBLIC_KEY} {ENDPOINT}",
            0,
            "f02_peer_or_mark_mismatch",
        ),
        (1, "0x100000000", 0, "f02_peer_or_mark_mismatch"),
        (2, "9.9.9.9 dev tun0", 0, "f02_endpoint_route_unconfirmed"),
        (2, "9.9.9.9 dev eth0 dev eth1", 0, "f02_endpoint_route_unconfirmed"),
        (3, "iptables v1.8.13 (legacy)", 0, "f02_firewall_backend_unconfirmed"),
        (4, "-P OUTPUT ACCEPT", 0, "f02_firewall_backend_unconfirmed"),
    ],
)
def test_unproved_target_refuses_with_categorical_error(
    root: Path, operation: int, output: str, exit_code: int, reason: str
) -> None:
    selected = tuple(OBSERVATIONS)[operation]

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        command = tuple(args[3:])
        if command == selected:
            return subprocess.CompletedProcess(
                args, exit_code, output, "provider secret"
            )
        return subprocess.CompletedProcess(args, 0, OBSERVATIONS[command], "")

    with pytest.raises(Refusal) as error:
        observe_target(root, GATEWAY, Commands(60, lambda: 0, execute), 30)
    assert str(error.value) == reason


def test_missing_private_config_starts_no_process(tmp_path: Path) -> None:
    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        pytest.fail("invalid config reached Docker")

    with pytest.raises(Refusal, match="^f02_peer_config_unavailable$"):
        observe_target(tmp_path, GATEWAY, Commands(60, lambda: 0, execute), 30)


@pytest.fixture
def campaign_storage(root: Path, tmp_path: Path) -> tuple[Path, Path]:
    mount = tmp_path / "mount"
    install = mount / "retrieval"
    install.mkdir(parents=True, mode=0o700)
    write_private(install / ".lock", "")
    write_private(install / "wg0.conf", (root / "wg0.conf").read_text())
    write_private(
        install / "installation.json",
        json.dumps(
            {
                "version": 2,
                "identity": IDENTITY,
                "storage_uuid": "11111111-2222-4333-8444-555555555555",
                "subnet": "172.30.200.0/24",
                "wireguard_sha256": "0" * 64,
            }
        ),
    )
    scope = tmp_path / "scope.json"
    write_private(
        scope,
        json.dumps(
            {
                "card": "R328-F02",
                "environment": "local",
                "installation_identity": IDENTITY,
                "owner_confirmed": True,
                "allow_endpoint_drop": True,
                "allow_owned_stop": True,
                "max_seconds": 300,
                "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            }
        ),
    )
    return mount, scope


class F02Docker(Docker):
    """Simulate mutable Docker observations at the process boundary only."""

    def __init__(self, scenario: str) -> None:
        super().__init__()
        self.scenario = scenario
        self.armed = False
        self.rule = False
        self.packet_count = 0
        self.closed = False
        self.operations: list[str] = []
        self.status_count = 0
        for row in self.rows:
            row["State"]["StartedAt"] = "2026-11-18T05:00:00Z"

    def execute(
        self, args: list[str], timeout: float
    ) -> subprocess.CompletedProcess[str]:
        tail = tuple(args[3:])
        if args[0] == sys.executable and args[2] == "status":
            self.status_count += 1
            if self.scenario == "preflight-restart":
                self.rows[0]["State"]["StartedAt"] = "2026-11-18T06:00:00Z"
        if tail in OBSERVATIONS:
            value = OBSERVATIONS[tail]
            if self.scenario == "missing-wg" and tail[0] == "wg":
                return subprocess.CompletedProcess(
                    args, 127, "", "private provider detail"
                )
            return subprocess.CompletedProcess(args, 0, value, "")
        if tail[:2] == ("test", "-f"):
            return subprocess.CompletedProcess(args, 0 if self.armed else 1, "", "")
        if "f02-rule" in args:
            name = args[args.index("f02-rule") + 1]
            self.operations.append(name)
            if name == "arm":
                self.armed = True
            elif name == "insert":
                assert self.armed and not self.closed
                self.rule = True
                if self.scenario in {"lost-insert-response", "lost-and-close-failed"}:
                    raise Refusal("fault_process_timeout")
            elif name == "observe":
                assert self.rule
                return subprocess.CompletedProcess(args, 0, str(self.packet_count), "")
            elif name == "close":
                if self.scenario in {"close-failed", "lost-and-close-failed"}:
                    return subprocess.CompletedProcess(args, 1, "", "")
                self.closed = True
                self.rule = False
            else:
                pytest.fail("unexpected rule operation")
            return subprocess.CompletedProcess(args, 0, "", "")
        result = super().execute(args, timeout)
        if self.rule and "curl" in args:
            if "--ipv6" in args:
                return result
            if self.scenario != "no-drop":
                self.packet_count += 1
            if self.scenario == "changed-namespace":
                self.rows[0]["Id"] = "d" * 64
            if self.scenario == "same-id-restart":
                self.rows[0]["State"]["StartedAt"] = "2026-11-18T06:00:00Z"
            if self.scenario == "leak":
                return result
            return subprocess.CompletedProcess(args, 28, "", "")
        if self.rule and "nslookup" in args:
            if self.scenario == "negative-dns-reply":
                return subprocess.CompletedProcess(args, 1, "NXDOMAIN", "")
            return subprocess.CompletedProcess(args, 137, "", "")
        if self.closed and self.scenario == "failed-recovery" and "nslookup" in args:
            return subprocess.CompletedProcess(args, 1, "", "")
        return result


def test_campaign_requires_three_drops_removal_and_same_generation(
    campaign_storage: tuple[Path, Path],
) -> None:
    docker = F02Docker("pass")
    report = campaign(
        *campaign_storage,
        execute=docker.execute,
        clock=docker.clock,
        sleep=docker.sleep,
    )
    assert report["passed"] is True and report["recovered"] is True
    assert report["rule_removed"] is True and docker.status_count == 2
    assert docker.operations == [
        "arm",
        "insert",
        "observe",
        "observe",
        "observe",
        "observe",
        "close",
    ]
    assert [row["packet_counter_delta"] for row in report["denial_samples"]] == [
        1,
        1,
        1,
    ]
    assert not any(args[:2] == ["docker", "stop"] for args in docker.calls)


@pytest.mark.parametrize(
    ("scenario", "reason", "samples"),
    [
        ("lost-insert-response", "fault_process_timeout", 0),
        ("lost-and-close-failed", "fault_process_timeout", 0),
        ("no-drop", "f02_no_observed_packet_drop", 0),
        ("leak", "fault_probe_expectation_failed", 0),
        ("negative-dns-reply", "fault_probe_expectation_failed", 0),
        ("changed-namespace", "f02_generation_changed", 1),
        ("same-id-restart", "f02_generation_changed", 1),
        ("close-failed", "fault_command_failed", 3),
        ("failed-recovery", "fault_probe_expectation_failed", 3),
    ],
)
def test_campaign_stops_owned_pair_on_failed_evidence(
    campaign_storage: tuple[Path, Path],
    scenario: str,
    reason: str,
    samples: int,
) -> None:
    docker = F02Docker(scenario)
    report = campaign(
        *campaign_storage,
        execute=docker.execute,
        clock=docker.clock,
        sleep=docker.sleep,
    )
    assert report["passed"] is False and report["recovered"] is False
    assert report["reason"] == reason
    assert len(report["denial_samples"]) == samples
    close_failed = scenario in {"close-failed", "lost-and-close-failed"}
    assert report["rule_removed"] is not close_failed
    assert ("cleanup_reason" in report) is close_failed
    assert report["rollback_stopped"] is True and docker.operations[-1] == "close"
    assert all(not row["State"]["Running"] for row in docker.rows)


def test_campaign_refuses_missing_observer_before_rule_arm(
    campaign_storage: tuple[Path, Path],
) -> None:
    docker = F02Docker("missing-wg")
    report = campaign(
        *campaign_storage,
        execute=docker.execute,
        clock=docker.clock,
        sleep=docker.sleep,
    )
    assert report["passed"] is False and report["attempted"] is False
    assert report["reason"] == "f02_peer_observation_unavailable"
    assert docker.operations == [] and "rollback_stopped" not in report


def test_other_card_scope_refuses_before_docker(
    campaign_storage: tuple[Path, Path],
) -> None:
    mount, scope = campaign_storage
    scope.write_text(scope.read_text().replace("R328-F02", "R328-F01"))
    docker = F02Docker("pass")
    with pytest.raises(Refusal, match="^f02_scope_unconfirmed$"):
        campaign(
            mount, scope, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
        )
    assert docker.calls == [] and docker.operations == []


def test_cli_plan_does_not_touch_docker_or_scope(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sys, "argv", ["retrieval_f02.py"])
    monkeypatch.setattr(
        retrieval_f02, "campaign", lambda *_: pytest.fail("campaign started")
    )
    assert retrieval_f02.main() == 0
    assert json.loads(capsys.readouterr().out)["execution"] == "not performed"


@pytest.mark.parametrize("dirty", [True, False])
def test_cli_requires_clean_source_and_keeps_exact_source_in_report(
    dirty: bool,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[Path] = []

    def git(args: list[str], **kwargs: object) -> str:
        assert args[0] == "git"
        return (" M script.py\n" if dirty else "") if args[1] == "status" else "f" * 40

    def approved(mount: Path, scope: Path) -> dict[str, object]:
        assert mount == tmp_path
        calls.append(scope)
        return {"passed": True}

    monkeypatch.setattr(subprocess, "check_output", git)
    monkeypatch.setattr(retrieval_f02, "campaign", approved)
    monkeypatch.setattr(
        sys, "argv", ["retrieval_f02.py", "--execute", "--storage", str(tmp_path)]
    )
    result = retrieval_f02.main()
    if dirty:
        assert result == 1 and calls == []
        assert (
            capsys.readouterr().err.strip() == "retrieval.f02_refused_before_campaign"
        )
    else:
        assert result == 0 and calls == [
            retrieval_f02.runtime.ROOT / "docs/security/scope.yaml"
        ]
        assert json.loads(capsys.readouterr().out)["source_commit"] == "f" * 40


def test_preflight_generation_change_refuses_before_arming(
    campaign_storage: tuple[Path, Path],
) -> None:
    docker = F02Docker("preflight-restart")
    report = campaign(
        *campaign_storage,
        execute=docker.execute,
        clock=docker.clock,
        sleep=docker.sleep,
    )
    assert report["passed"] is False and report["attempted"] is False
    assert report["reason"] == "f02_preflight_generation_changed"
    assert docker.status_count == 1 and docker.operations == []
    assert not any(args[:2] == ["docker", "stop"] for args in docker.calls)


@pytest.mark.parametrize("device", ["eth0", "tun0"])
def test_marked_peer_uses_marked_route_without_fallback(
    root: Path, device: str
) -> None:
    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        operation = tuple(args[3:])
        if operation == ("wg", "show", "tun0", "fwmark"):
            result = "0x10\n"
        elif operation[0] == "ip":
            assert operation == ("ip", "-4", "route", "get", "9.9.9.9", "mark", "0x10")
            result = f"9.9.9.9 dev {device}\n"
        else:
            result = OBSERVATIONS[operation]
        return subprocess.CompletedProcess(args, 0, result, "")

    commands = Commands(60, lambda: 0, execute)
    if device == "eth0":
        target = observe_target(root, GATEWAY, commands, 30)
        assert target.mark == "0x10" and target.interface == "eth0"
    else:
        with pytest.raises(Refusal, match="^f02_endpoint_route_unconfirmed$"):
            observe_target(root, GATEWAY, commands, 30)
