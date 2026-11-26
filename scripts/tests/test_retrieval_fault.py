"""Exercise the real fault-card decisions with only process/time observations doubled."""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import retrieval_fault as fault
from retrieval_config import Refusal, write_private

IDENTITY = "a" * 16


class Docker:
    """Observe Docker selection, network probes and recovery without touching real services."""

    def __init__(self) -> None:
        self.elapsed = 0.0
        self.killed = False
        self.calls: list[list[str]] = []
        self.times: list[float] = []
        self.failure = ""
        self.rows = self.pair("a" * 64, "c" * 64)

    def pair(self, gateway: str, client: str) -> list[dict[str, object]]:
        project = "pctv-retrieval-" + IDENTITY
        return [
            {
                "Id": identifier,
                "Name": "/" + project + "-" + role,
                "Config": {
                    "Labels": {
                        "org.popcorntv.retrieval": IDENTITY,
                        "com.docker.compose.project": project,
                        "com.docker.compose.service": role,
                    }
                },
                "State": {"Running": True, "Status": "running"},
            }
            for role, identifier in (("gluetun", gateway), ("client", client))
        ]

    def clock(self) -> float:
        return self.elapsed

    def sleep(self, seconds: float) -> None:
        self.elapsed += seconds

    def execute(
        self, args: list[str], timeout: float
    ) -> subprocess.CompletedProcess[str]:
        self.calls.append(args)
        self.times.append(self.elapsed)
        self.elapsed += 0.05
        code, value = 0, ""
        if args[0] == sys.executable:
            if "status" in args and self.failure == "preflight":
                code = 1
            if "start" in args:
                if self.failure == "recovery":
                    code = 1
                elif self.failure != "same-generation":
                    self.rows = self.pair("b" * 64, "d" * 64)
                    self.killed = False
                else:
                    self.rows[0]["State"]["Running"] = True
                    self.killed = False
        elif args[:2] == ["docker", "ps"]:
            key, wanted = (
                args[args.index("--filter") + 1].removeprefix("label=").split("=", 1)
            )
            value = "\n".join(
                row["Name"].lstrip("/")
                for row in self.rows
                if row["Config"]["Labels"].get(key) == wanted
            )
        elif args[:2] == ["docker", "inspect"]:
            selected = [
                row
                for row in self.rows
                if row["Id"] in args[2:] or row["Name"].lstrip("/") in args[2:]
            ]
            value = json.dumps(selected)
            if self.failure == "malformed-inspection" and self.killed:
                value = "FAKE-PROVIDER-CANARY"
        elif args[:2] == ["docker", "kill"]:
            assert args == ["docker", "kill", "--signal", "KILL", "a" * 64]
            self.killed = True
            self.rows[0]["State"]["Running"] = False
            if self.failure == "gateway-alive":
                self.rows[0]["State"]["Running"] = True
            if self.failure == "client-lost":
                self.rows[1]["State"]["Running"] = False
            if self.failure == "kill-uncertain":
                code = 124
            if self.failure == "cancelled":
                raise KeyboardInterrupt
        elif args[:2] == ["docker", "stop"]:
            for row in self.rows:
                if row["Id"] == args[-1]:
                    if self.failure in {"stop-fails", "stop-no-op"} and row[
                        "Name"
                    ].endswith("-client"):
                        code = 1 if self.failure == "stop-fails" else 0
                    else:
                        row["State"]["Running"] = False
        elif "readlink" in args:
            value = (
                "net:[200]"
                if self.killed and self.failure == "namespace-replaced"
                else "net:[100]"
            )
        elif "nslookup" in args:
            if self.killed and self.failure == "dns-adapter-timeout":
                raise Refusal("fault_process_timeout")
            code = (
                (137 if self.failure == "dns-inner-timeout" else 1)
                if self.killed
                else 0
            )
            if args[2] == "d" * 64 and self.failure == "recovery-dns":
                code = 1
            if self.killed and self.failure == "dns-leak":
                code = 0
        elif args[-1] == "/proc/sys/net/ipv6/conf/all/disable_ipv6":
            value = "1"
        elif "curl" in args:
            if self.killed and self.failure == "ipv4-adapter-timeout":
                raise Refusal("fault_process_timeout")
            if self.killed and self.failure == "transport-exit-124":
                return subprocess.CompletedProcess(args, 124, "", "")
            code = 7 if "--ipv6" in args or self.killed else 0
            if args[2] == "d" * 64 and self.failure == "recovery-ipv4":
                code = 7
            if (
                self.killed
                and "--ipv6" not in args
                and self.failure in {"ipv4-leak", "stop-fails", "stop-no-op"}
            ):
                code = 0
        else:
            pytest.fail("unexpected process boundary: " + args[0])
        return subprocess.CompletedProcess(
            args, code, value, "FAKE-PROVIDER-CANARY" if code else ""
        )


@pytest.fixture
def installation(tmp_path: Path) -> tuple[Path, Path]:
    mount = tmp_path / "mount"
    root = mount / "retrieval"
    root.mkdir(parents=True, mode=0o700)
    write_private(root / ".lock", "")
    write_private(
        root / "installation.json",
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
    scope = tmp_path / "fake-scope.json"
    write_private(
        scope,
        json.dumps(
            {
                "card": fault.CARD,
                "environment": "local",
                "installation_identity": IDENTITY,
                "owner_confirmed": True,
                "allow_abrupt_gateway_exit": True,
                "allow_owned_recovery": True,
                "max_seconds": fault.WINDOW,
                "expires_at": (datetime.now(UTC) + timedelta(hours=1)).isoformat(),
            }
        ),
    )
    return mount, scope


@pytest.mark.parametrize("dns_timeout", [False, True])
def test_one_gateway_fault_has_three_denial_samples_and_positive_recovery(
    installation: tuple[Path, Path],
    dns_timeout: bool,
) -> None:
    docker = Docker()
    if dns_timeout:
        docker.failure = "dns-inner-timeout"
    before = (installation[0] / "retrieval/installation.json").read_bytes()
    report = fault.campaign(
        *installation, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
    )
    required = {
        "card": fault.CARD,
        "passed": True,
        "fault_attempted": True,
        "fault_observed": True,
        "denial_samples": 3,
        "recovered": True,
    }
    assert all(report[key] == value for key, value in required.items())
    assert 10 <= report["fault_observation_seconds"] < 30
    assert report["elapsed_seconds"] == round(docker.elapsed, 3)
    assert len([args for args in docker.calls if args[:2] == ["docker", "kill"]]) == 1
    assert len([args for args in docker.calls if "start" in args]) == 1
    assert not any(args[:2] == ["docker", "stop"] for args in docker.calls)
    assert 10 <= docker.elapsed < fault.WINDOW
    assert (installation[0] / "retrieval/installation.json").read_bytes() == before

    dns_calls = [args for args in docker.calls if "nslookup" in args]
    assert dns_calls == [
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
        ]
        for client in ["c" * 64] * 4 + ["d" * 64]
    ]
    curl_calls = [args for args in docker.calls if "curl" in args]
    assert curl_calls == [
        [
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
            *tail,
        ]
        for client in ["c" * 64] * 4 + ["d" * 64]
        for tail in (
            ["https://1.1.1.1/cdn-cgi/trace"],
            ["--ipv6", "https://[2606:4700:4700::1111]/cdn-cgi/trace"],
        )
    ]
    batch_times = [
        stamp
        for args, stamp in zip(docker.calls, docker.times, strict=True)
        if "nslookup" in args
    ][1:4]
    assert [stamp - batch_times[0] for stamp in batch_times] == pytest.approx(
        [0, 5, 10]
    )


@pytest.mark.parametrize(
    "failure",
    [
        "preflight",
        "gateway-alive",
        "client-lost",
        "namespace-replaced",
        "ipv4-leak",
        "dns-leak",
        "ipv4-adapter-timeout",
        "dns-adapter-timeout",
        "transport-exit-124",
        "kill-uncertain",
        "recovery",
        "recovery-ipv4",
        "recovery-dns",
        "same-generation",
        "cancelled",
        "malformed-inspection",
    ],
)
def test_failed_or_unobserved_fault_never_qualifies_and_attempts_bounded_rollback(
    installation: tuple[Path, Path], failure: str
) -> None:
    docker = Docker()
    docker.failure = failure
    report = fault.campaign(
        *installation, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
    )
    assert report["passed"] is False
    assert report["recovered"] is False
    assert "FAKE-PROVIDER-CANARY" not in json.dumps(report)
    if failure == "preflight":
        assert report["fault_attempted"] is False
        assert not any(args[:2] == ["docker", "kill"] for args in docker.calls)
    elif failure == "malformed-inspection":
        assert report["rollback_stopped"] is False
    else:
        assert report["rollback_stopped"] is True
        assert all(row["State"]["Running"] is False for row in docker.rows)
    if failure in {"recovery-ipv4", "recovery-dns"}:
        assert [
            args[-1] for args in docker.calls if args[:2] == ["docker", "stop"]
        ] == ["d" * 64, "b" * 64]
    if failure in {"ipv4-adapter-timeout", "dns-adapter-timeout", "transport-exit-124"}:
        assert report["denial_samples"] == 0
    assert len([args for args in docker.calls if args[:2] == ["docker", "kill"]]) <= 1


@pytest.mark.parametrize("failure", ["stop-fails", "stop-no-op"])
def test_unconfirmed_rollback_stays_failed_and_still_attempts_gateway(
    installation: tuple[Path, Path], failure: str
) -> None:
    docker = Docker()
    docker.failure = failure
    report = fault.campaign(
        *installation, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
    )
    assert report["passed"] is False and report["rollback_stopped"] is False
    stops = [args[-1] for args in docker.calls if args[:2] == ["docker", "stop"]]
    assert stops == ["c" * 64, "a" * 64]


@pytest.mark.parametrize(
    "field,value",
    [
        ("card", "R328-F02"),
        ("environment", "prod"),
        ("installation_identity", "b" * 16),
        ("owner_confirmed", False),
        ("owner_confirmed", 1),
        ("allow_abrupt_gateway_exit", False),
        ("allow_owned_recovery", False),
        ("max_seconds", 300.0),
        ("max_seconds", 600),
        ("expires_at", "invalid"),
        ("expires_at", "2000-01-01T00:00:00+00:00"),
        ("expires_at", "2099-01-01T00:00:00+00:00"),
        ("expires_at", "2026-11-18T12:00:00"),
    ],
)
def test_scope_refuses_wrong_owner_card_environment_or_window_before_any_command(
    installation: tuple[Path, Path], field: str, value: object
) -> None:
    mount, path = installation
    scope = json.loads(path.read_text())
    scope[field] = value
    path.write_text(json.dumps(scope))
    docker = Docker()
    with pytest.raises(Refusal):
        fault.campaign(
            mount, path, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
        )
    assert docker.calls == []


def test_missing_scope_never_touches_docker(installation: tuple[Path, Path]) -> None:
    installation[1].unlink()
    docker = Docker()
    with pytest.raises(Refusal):
        fault.campaign(
            *installation,
            execute=docker.execute,
            clock=docker.clock,
            sleep=docker.sleep,
        )
    assert docker.calls == []


def test_exhausted_budget_starts_no_process() -> None:
    seen: list[list[str]] = []

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        seen.append(args)
        return subprocess.CompletedProcess(args, 0, "", "")

    commands = fault.Commands(10, lambda: 11, execute)
    with pytest.raises(Refusal, match="fault_budget_exhausted"):
        commands.need(["unused"], 5, 10)
    assert seen == []


def test_real_timeout_reaps_only_the_test_process_group() -> None:
    with pytest.raises(Refusal, match="fault_process_timeout"):
        fault.process([sys.executable, "-c", "import time; time.sleep(60)"], 0.05)


def test_default_cli_only_describes_the_plan(
    capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sys, "argv", ["retrieval_fault.py"])
    assert fault.main() == 0
    assert json.loads(capsys.readouterr().out)["execution"] == "not performed"


def test_active_cli_without_storage_refuses_before_campaign(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys, "argv", ["retrieval_fault.py", "--execute"])
    assert fault.main() == 1


def test_termination_handler_enters_categorical_rollback_path() -> None:
    with pytest.raises(Refusal, match="fault_interrupted"):
        fault.interrupted(15, None)


def test_slow_preflight_never_injects_without_recovery_budget(
    installation: tuple[Path, Path],
) -> None:
    docker = Docker()

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        result = docker.execute(args, timeout)
        if "status" in args:
            docker.elapsed = 75
        return result

    report = fault.campaign(
        *installation, execute=execute, clock=docker.clock, sleep=docker.sleep
    )
    assert report["passed"] is False and report["fault_attempted"] is False
    assert report["reason"] == "fault_recovery_budget_insufficient"
    assert not any(args[:2] == ["docker", "kill"] for args in docker.calls)


def test_expired_observation_phase_is_failed_and_uses_reserved_rollback(
    installation: tuple[Path, Path],
) -> None:
    docker = Docker()

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        result = docker.execute(args, timeout)
        if docker.killed and "curl" in args:
            docker.elapsed += 31
        return result

    report = fault.campaign(
        *installation, execute=execute, clock=docker.clock, sleep=docker.sleep
    )
    assert report["passed"] is False
    assert report["denial_samples"] < 3
    assert report["rollback_stopped"] is True
    assert all(row["State"]["Running"] is False for row in docker.rows)


def test_command_finishing_after_overall_deadline_cannot_be_green() -> None:
    docker = Docker()

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        docker.elapsed = 11
        return subprocess.CompletedProcess(args, 0, "late success", "")

    commands = fault.Commands(10, docker.clock, execute)
    with pytest.raises(Refusal, match="fault_budget_exhausted"):
        commands.need(["fixture"], 5, 10)


@pytest.mark.parametrize("kind", ["unsafe-mode", "extra-target", "short-window"])
def test_scope_shape_and_private_permissions_are_enforced(
    installation: tuple[Path, Path], kind: str
) -> None:
    mount, scope = installation
    if kind == "unsafe-mode":
        scope.chmod(0o644)
    else:
        data = json.loads(scope.read_text())
        if kind == "extra-target":
            data["extra_target"] = "unapproved"
        else:
            data["expires_at"] = (datetime.now(UTC) + timedelta(seconds=60)).isoformat()
        scope.write_text(json.dumps(data))
    docker = Docker()
    with pytest.raises(Refusal):
        fault.campaign(
            mount, scope, execute=docker.execute, clock=docker.clock, sleep=docker.sleep
        )
    assert docker.calls == []


def test_process_unavailable_is_categorical_not_raw_output() -> None:
    def unavailable(
        args: list[str], timeout: float
    ) -> subprocess.CompletedProcess[str]:
        raise OSError("FAKE-PROVIDER-CANARY")

    with pytest.raises(Refusal, match="fault_process_unavailable") as error:
        fault.Commands(10, lambda: 0, unavailable).need(["fixture"], 5, 10)
    assert "FAKE-PROVIDER-CANARY" not in str(error.value)


def test_cleanup_kills_detached_stdio_descendant_and_releases_its_lock(
    tmp_path: Path,
) -> None:
    import fcntl

    marker = tmp_path / "ready"
    lock = tmp_path / "lock"
    child_code = (
        "import fcntl,os,signal,sys,time;from pathlib import Path;"
        "signal.signal(signal.SIGTERM,signal.SIG_IGN);"
        "f=open(sys.argv[2],'w');fcntl.flock(f,fcntl.LOCK_EX);"
        "Path(sys.argv[1]).write_text(str(os.getpid()));time.sleep(60)"
    )
    parent_code = (
        "import subprocess,sys,time;"
        "subprocess.Popen([sys.executable,'-c',*sys.argv[1:]],"
        "stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);"
        "time.sleep(60)"
    )
    parent = subprocess.Popen(
        [sys.executable, "-c", parent_code, child_code, str(marker), str(lock)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 10
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        assert marker.exists(), "fixture never acquired its lock"
        with lock.open() as handle:
            with pytest.raises(BlockingIOError):
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fault.terminate_group(parent)
            deadline = time.monotonic() + 2
            while True:
                try:
                    fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(0.01)
        state = Path("/proc") / marker.read_text() / "stat"
        if state.exists():
            assert state.read_text().rsplit(")", 1)[1].split()[0] == "Z"
    finally:
        try:
            os.killpg(parent.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        parent.communicate(timeout=2)


def test_cancelled_process_reaps_its_group_and_propagates_cancellation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import TracebackType
    from typing import Self

    calls: list[tuple[int, int]] = []

    class Child:
        pid = 12345
        returncode = -15
        first = True

        def __enter__(self) -> Self:
            return self

        def __exit__(
            self, kind: object, error: object, trace: TracebackType | None
        ) -> None:
            pass

        def communicate(self, timeout: float) -> tuple[str, str]:
            if self.first:
                self.first = False
                raise KeyboardInterrupt
            return "", ""

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: Child())
    monkeypatch.setattr(
        fault.os, "killpg", lambda pid, action: calls.append((pid, action))
    )
    with pytest.raises(KeyboardInterrupt):
        fault.process(["fixture"], 5)
    assert calls == [(12345, fault.signal.SIGTERM), (12345, fault.signal.SIGKILL)]


def test_active_cli_needs_clean_source_before_scope_or_docker(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[list[str]] = []

    def git(args: list[str], **kwargs: object) -> str:
        calls.append(args)
        assert args[:2] == ["git", "status"]
        return " M fixture.py\n"

    monkeypatch.setattr(subprocess, "check_output", git)
    monkeypatch.setattr(
        sys, "argv", ["retrieval_fault.py", "--execute", "--storage", str(tmp_path)]
    )
    assert fault.main() == 1
    assert len(calls) == 1


def test_active_cli_missing_owner_scope_never_reaches_a_process(
    installation: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def git(args: list[str], **kwargs: object) -> str:
        assert args[0] == "git"
        return "" if args[1] == "status" else "f" * 40

    def forbidden(*args: object, **kwargs: object) -> None:
        pytest.fail("missing owner scope reached a process")

    monkeypatch.setattr(subprocess, "check_output", git)
    monkeypatch.setattr(subprocess, "Popen", forbidden)
    monkeypatch.setattr(fault.runtime, "ROOT", tmp_path)
    monkeypatch.setattr(
        sys,
        "argv",
        ["retrieval_fault.py", "--execute", "--storage", str(installation[0])],
    )
    assert fault.main() == 1


def test_command_reserves_cleanup_inside_remaining_phase_budget() -> None:
    timeouts: list[float] = []

    def execute(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
        timeouts.append(timeout)
        return subprocess.CompletedProcess(args, 0, "", "")

    commands = fault.Commands(10, lambda: 0, execute)
    commands.call(["fixture"], 15, 10)
    assert timeouts == [8]
    with pytest.raises(Refusal, match="fault_budget_exhausted"):
        commands.call(["fixture"], 15, 2)
    assert timeouts == [8]
