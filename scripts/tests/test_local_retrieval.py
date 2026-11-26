"""Test lifecycle failure semantics using doubles only at OS/process boundaries."""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Self

import local_retrieval as runtime
import pytest
from retrieval_config import MAX_STORAGE, Refusal, write_private


@pytest.fixture
def initialized(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Exercise real initialization with an OS mount observation and numeric test endpoint."""
    key = base64.b64encode(bytes(range(32))).decode()
    source = tmp_path / "source"
    write_private(
        source,
        f"[Interface]\nPrivateKey={key}\nAddress=10.7.0.2/32\n"
        f"[Peer]\nPublicKey={key}\nAllowedIPs=0.0.0.0/0\nEndpoint=1.1.1.1:51820\n",
    )
    mount = tmp_path / "mount"
    mount.mkdir()
    monkeypatch.setattr(Path, "is_mount", lambda self: self == mount)
    monkeypatch.setattr(
        runtime.os,
        "statvfs",
        lambda path: SimpleNamespace(
            f_blocks=MAX_STORAGE // 4096, f_frsize=4096, f_bavail=MAX_STORAGE // 4096
        ),
    )
    original_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if arguments[:2] == ["docker", "network"]:
            return subprocess.CompletedProcess(arguments, 0, "", "")
        if arguments[0] == "ip":
            return subprocess.CompletedProcess(arguments, 0, "[]", "")
        if arguments[0] == "findmnt":
            return subprocess.CompletedProcess(
                arguments,
                0,
                json.dumps(
                    {
                        "filesystems": [
                            {
                                "target": str(mount),
                                "source": "/dev/loop-test",
                                "uuid": "11111111-2222-4333-8444-555555555555",
                                "fstype": "ext4",
                                "fsroot": "/",
                                "options": "rw,nosuid,nodev,noexec",
                            }
                        ]
                    }
                ),
                "",
            )
        return original_run(arguments, **kwargs)

    monkeypatch.setattr(subprocess, "run", run)
    return runtime.initialize(mount, source)


def test_initialize_is_private_and_non_destructive(initialized: Path) -> None:
    root = initialized
    assert root.stat().st_mode & 0o777 == 0o700
    password = (root / "password").read_text()
    assert len(password) == 64
    assert password not in (root / "config/qBittorrent/qBittorrent.conf").read_text()
    assert "identity" in runtime.installation(root)
    before = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
    with pytest.raises(Refusal, match="installation_already_exists"):
        runtime.initialize(root.parent, root.parent.parent / "source")
    assert all(p.read_bytes() == contents for p, contents in before.items())


def test_changed_wireguard_refuses_without_echoing_secret(initialized: Path) -> None:
    path = initialized / "wg0.conf"
    path.write_text(path.read_text().replace("1.1.1.1", "8.8.8.8"))
    with pytest.raises(Refusal, match="installation_wireguard_changed"):
        runtime.installation(initialized)


@pytest.mark.parametrize(
    "field,value",
    [
        ("identity", "../../foreign"),
        ("version", 3),
        ("version", True),
        ("version", 2.0),
        ("version", 1),
        ("storage_uuid", "not-a-uuid"),
        ("storage_source", "/dev/other"),
    ],
)
def test_manifest_drift_is_refused(
    initialized: Path, field: str, value: object
) -> None:
    path = initialized / "installation.json"
    manifest = json.loads(path.read_text())
    manifest[field] = value
    path.write_text(json.dumps(manifest))
    with pytest.raises(Refusal, match="installation_manifest"):
        runtime.installation(initialized)


def test_lock_excludes_overlapping_lifecycle_commands(initialized: Path) -> None:
    with (
        runtime.locked(initialized),
        pytest.raises(Refusal, match="installation_busy"),
        runtime.locked(initialized),
    ):
        pytest.fail("second lifecycle operation acquired same installation lock")


def test_compose_model_confines_client_and_keeps_values_out_of_model(
    initialized: Path,
) -> None:
    manifest = runtime.installation(initialized)
    model = json.loads(
        json.dumps(runtime.compose_model(initialized, str(manifest["identity"])))
    )
    client, gateway = model["services"]["client"], model["services"]["gluetun"]
    assert client["network_mode"] == "service:gluetun"
    assert "networks" not in client and "ports" not in client and "ports" not in gateway
    assert client["cap_drop"] == ["ALL"] and "cap_add" not in client
    assert not client["user"].startswith("0:")
    text = json.dumps(model)
    assert (initialized / "password").read_text() not in text
    assert "PrivateKey" not in text
    assert all(
        m["source"].startswith(str(initialized) + "/")
        for service in (client, gateway)
        for m in service["volumes"]
    )


def test_composition_preserves_special_path_characters(tmp_path: Path) -> None:
    path = tmp_path / 'quote" backslash\\ retrieval'
    path.mkdir()
    write_private(path / "installation.json", json.dumps({"subnet": "172.30.200.0/24"}))
    model = json.loads(json.dumps(runtime.compose_model(path, "a" * 16)))
    assert model["services"]["gluetun"]["volumes"][0]["source"] == str(
        path / "wg0.conf"
    )


@pytest.mark.parametrize("failure", ["timeout", "oserror", "exit"])
def test_process_failures_have_no_raw_diagnostics(
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    def run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        if failure == "timeout":
            raise subprocess.TimeoutExpired(["CANARY"], 1, output="CANARY")
        if failure == "oserror":
            raise OSError("CANARY")
        return subprocess.CompletedProcess(["CANARY"], 1, "CANARY", "CANARY")

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal) as captured:
        runtime.command(["docker", "CANARY"], "CANARY")
    assert "CANARY" not in str(captured.value)


def test_image_scan_failure_cannot_start_or_stop_container(
    initialized: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = str(runtime.installation(initialized)["identity"])
    calls: list[list[str]] = []

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(arguments)
        if arguments[:2] == ["docker", "ps"]:
            return subprocess.CompletedProcess(arguments, 0, "", "")
        if arguments[0] == "ip":
            return subprocess.CompletedProcess(arguments, 0, "[]", "")
        if arguments[:2] == ["docker", "network"]:
            return subprocess.CompletedProcess(arguments, 0, "", "")
        if arguments[0] == "make" and "scan-docker-image" in arguments:
            return subprocess.CompletedProcess(
                arguments, 1, "vulnerability details", ""
            )
        pytest.fail("unexpected mutation after failed scan: " + arguments[0])

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal):
        runtime.start(initialized, identity)
    assert calls[-1][0] == "make"
    assert "scan-docker-image" in calls[-1]
    assert "TRIVY_EXIT=1" in calls[-1]
    assert not any(call[:2] == ["docker", "compose"] for call in calls)


def test_stop_attempts_gateway_after_client_failure_and_keeps_state(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if arguments[:2] == ["docker", "stop"] and arguments[-1] == "c" * 64:
            docker_observations["calls"].append(arguments)
            return subprocess.CompletedProcess(arguments, 1, "controlled failure", "")
        return previous_run(arguments, **kwargs)

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="stop_unconfirmed"):
        runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    stops = [
        call for call in docker_observations["calls"] if call[:2] == ["docker", "stop"]
    ]
    assert [call[-1] for call in stops] == ["c" * 64, "a" * 64]
    assert docker_observations["containers"][1]["State"]["Running"] is True
    assert docker_observations["containers"][0]["State"]["Running"] is False
    assert (initialized / "password").exists()


@pytest.mark.parametrize(
    "trace", ["", "ip=127.0.0.1", "ip=8.8.8.8\nip=1.1.1.1", "ip=invalid"]
)
def test_egress_observation_refuses_missing_ambiguous_or_private(trace: str) -> None:
    with pytest.raises((Refusal, ValueError)):
        runtime.trace_address(trace)


def test_egress_observation_extracts_only_public_address() -> None:
    assert runtime.trace_address("fl=1\nip=8.8.8.8\ncolo=test\n") == "8.8.8.8"


def test_actual_cli_refuses_unbounded_directory_without_docker(tmp_path: Path) -> None:
    marker = tmp_path / "docker-called"
    binary = tmp_path / "docker"
    binary.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\nexit 1\n')
    binary.chmod(0o700)
    result = subprocess.run(
        [
            sys.executable,
            str(runtime.ROOT / "scripts/local_retrieval.py"),
            "init",
            "--storage",
            str(tmp_path),
            "--wireguard",
            str(tmp_path / "missing"),
        ],
        env={**os.environ, "PATH": str(tmp_path) + ":" + os.environ.get("PATH", "")},
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    assert result.returncode == 1
    assert "storage_mount_required" in result.stderr
    assert "Traceback" not in result.stderr
    assert not marker.exists()
    assert not (tmp_path / "retrieval").exists()


@pytest.mark.parametrize(
    "damaged", ["wg0.conf", "password", "config/qBittorrent/qBittorrent.conf"]
)
def test_stop_identity_survives_damaged_runtime_config(
    initialized: Path, damaged: str
) -> None:
    path = initialized / damaged
    path.unlink()
    assert "identity" in runtime.installation(initialized, require_reserve=False)
    with pytest.raises((Refusal, OSError)):
        runtime.installation(initialized)


def test_saved_transfer_refused_before_any_docker_mutation(
    initialized: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = str(runtime.installation(initialized)["identity"])
    saved = initialized / "config/qBittorrent/BT_backup"
    saved.mkdir()
    torrent = saved / "owned-fixture.fastresume"
    torrent.write_bytes(b"preserve-saved-state")
    calls: list[list[str]] = []

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        calls.append(arguments)
        assert arguments[:2] == ["docker", "ps"]
        return subprocess.CompletedProcess(arguments, 0, "", "")

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="persisted_transfer_state_present"):
        runtime.start(initialized, identity)
    assert len(calls) == 2
    assert {call[call.index("--filter") + 1].split("=", 2)[1] for call in calls} == {
        "org.popcorntv.retrieval",
        "com.docker.compose.project",
    }
    assert torrent.read_bytes() == b"preserve-saved-state"


@pytest.mark.parametrize("suffix", ["", "-wal", "-shm", "-journal"])
def test_empty_start_rejects_sqlite_resume_state_before_network_checks(
    initialized: Path, monkeypatch: pytest.MonkeyPatch, suffix: str
) -> None:
    profile = initialized / "config/qBittorrent"
    marker = profile / ("torrents.db" + suffix)
    # A dangling link is evidence of unsupported state, too.
    marker.symlink_to(profile / "missing")
    monkeypatch.setattr(runtime, "inspect_owned", lambda identity: [])

    def unexpected_network_check(root: Path, identity: str) -> None:
        pytest.fail("startup reached the network check with alternate resume state")

    monkeypatch.setattr(runtime, "verify_network_plan", unexpected_network_check)
    with pytest.raises(Refusal, match="unsupported_resume_storage"):
        runtime.start(initialized, "a" * 16)
    assert marker.is_symlink()


def test_real_compose_does_not_expand_literal_environment_path(tmp_path: Path) -> None:
    identity = "a" * 16
    root = tmp_path / "${HOME}-$USER" / "retrieval"
    with pytest.raises(Refusal, match="storage_interpolation_character"):
        runtime.compose(root, identity, ["config", "--format", "json"])
    safe = tmp_path / 'quote" and space' / "retrieval"
    safe.mkdir(parents=True)
    write_private(safe / "installation.json", json.dumps({"subnet": "172.30.200.0/24"}))
    result = runtime.compose(safe, identity, ["config", "--format", "json"])
    assert json.loads(result)["services"]["client"]["volumes"][0]["source"] == str(
        safe / "config"
    )


@pytest.fixture
def docker_observations(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> dict[str, object]:
    """Provide process and host-HTTP observations, exercising actual controller decisions."""
    identity = str(runtime.installation(initialized)["identity"])
    model = json.loads(json.dumps(runtime.compose_model(initialized, identity)))
    observations: dict[str, object] = {
        "containers": [],
        "queue": [],
        "anonymous": "403",
        "egress": "8.8.8.8",
        "namespace": "net:[321]",
        "fail_up": False,
        "fail_stop": False,
        "calls": [],
        "login": "HTTP/1.1 200 OK\r\nSet-Cookie: QBT_SID_8080=generated+Session/=; HttpOnly\r\n\r\n",
    }
    containers = []
    for role in ("gluetun", "client"):
        expected = model["services"][role]
        containers.append(
            {
                "Id": ("a" if role == "gluetun" else "c") * 64,
                "Name": "/" + expected["container_name"],
                "State": {
                    "Health": {"Status": "healthy"},
                    "Running": True,
                    "Status": "running",
                },
                "Config": {
                    "Image": expected["image"],
                    "Entrypoint": expected["entrypoint"],
                    "Cmd": None,
                    "User": expected["user"],
                    "Labels": {
                        **expected["labels"],
                        "com.docker.compose.project": "pctv-retrieval-" + identity,
                        "com.docker.compose.service": role,
                    },
                    "Env": [
                        f"{key}={value}"
                        for key, value in expected["environment"].items()
                    ],
                },
                "HostConfig": {
                    "Tmpfs": dict(item.split(":", 1) for item in expected["tmpfs"]),
                    "LogConfig": {
                        "Type": "json-file",
                        "Config": {"max-size": "10m", "max-file": "3"},
                    },
                    "RestartPolicy": {"Name": "no", "MaximumRetryCount": 0},
                    "Privileged": False,
                    "ReadonlyRootfs": True,
                    "PortBindings": {},
                    "Dns": ["127.0.0.1"] if role == "gluetun" else [],
                    "CapDrop": ["ALL"],
                    "CapAdd": ["CAP_NET_ADMIN", "CAP_DAC_OVERRIDE"]
                    if role == "gluetun"
                    else [],
                    "SecurityOpt": ["no-new-privileges:true"],
                    "Memory": (256 if role == "gluetun" else 768) * 1024**2,
                    "PidsLimit": 64 if role == "gluetun" else 128,
                    "NanoCpus": 500000000 if role == "gluetun" else 1000000000,
                    "NetworkMode": "container:" + "a" * 64
                    if role == "client"
                    else "bridge",
                },
                "Mounts": [
                    {
                        "Type": "bind",
                        "Source": m["source"],
                        "Destination": m["target"],
                        "RW": not m.get("read_only", False),
                    }
                    for m in expected["volumes"]
                ],
                "NetworkSettings": {
                    "Networks": {}
                    if role == "client"
                    else {"pctv-retrieval-" + identity + "_egress": {}}
                },
            }
        )
    containers[0]["Config"]["Env"].append(
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    )
    observations["containers"] = containers
    startup_containers = json.dumps(containers)
    preferences = {
        key: False for key in ("dht", "pex", "lsd", "upnp", "bypass_local_auth")
    }
    preferences["current_network_interface"] = "tun0"
    observations["preferences"] = preferences
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if arguments[0] in {"findmnt", "ip"} or arguments[:2] == ["docker", "network"]:
            return previous_run(arguments, **kwargs)
        observations["calls"].append(arguments)
        data = str(kwargs.get("input", ""))
        value = ""
        code = 0
        if arguments[:2] == ["docker", "ps"]:
            key, wanted = (
                arguments[arguments.index("--filter") + 1]
                .removeprefix("label=")
                .split("=", 1)
            )
            value = "\n".join(
                item["Name"].lstrip("/")
                for item in observations["containers"]
                if item["Config"]["Labels"].get(key) == wanted
            )
        elif arguments[:2] == ["docker", "inspect"]:
            value = json.dumps(
                [
                    item
                    for item in observations["containers"]
                    if item["Id"] in arguments[2:]
                    or item["Name"].lstrip("/") in arguments[2:]
                ]
            )
        elif arguments[:2] == ["docker", "stop"]:
            code = 1 if observations["fail_stop"] else 0
            if not code:
                for item in observations["containers"]:
                    if item["Id"] == arguments[-1]:
                        item["State"].update(Running=False, Status="exited")
        elif arguments[:2] == ["docker", "rm"]:
            observations["containers"] = [
                item
                for item in observations["containers"]
                if item["Id"] != arguments[-1]
            ]
        elif arguments[0] == "make" and "scan-docker-image" in arguments:
            pass
        elif arguments[:2] == ["docker", "compose"]:
            if observations["fail_up"] and "up" in arguments:
                code = 1
            elif "up" in arguments:
                observations["containers"] = json.loads(startup_containers)
        elif "readlink" in arguments:
            value = (
                str(observations["namespace"])
                if "client" in arguments[2]
                else "net:[321]"
            )
        elif arguments[-1] == "/etc/resolv.conf":
            value = "nameserver 127.0.0.1\n"
        elif arguments[-1] == "/proc/sys/net/ipv6/conf/all/disable_ipv6":
            value = "1\n"
        elif "/auth/login" in data:
            value = str(observations["login"])
        elif "/app/preferences" in data:
            value = json.dumps(observations["preferences"])
        elif "/torrents/info" in data:
            value = json.dumps(observations["queue"])
        elif "%{http_code}" in arguments:
            value = str(observations["anonymous"])
        elif "https://1.1.1.1/cdn-cgi/trace" in arguments:
            value = "ip=" + str(observations["egress"]) + "\n"
        else:
            pytest.fail("unhandled process boundary: " + arguments[0])
        return subprocess.CompletedProcess(arguments, code, value, "")

    class Response:
        def __enter__(self) -> Self:
            return self

        def __exit__(self, *args: object) -> None:
            pass

        def read(self, limit: int) -> bytes:
            return b"ip=1.1.1.1\n"

    monkeypatch.setattr(subprocess, "run", run)
    monkeypatch.setattr(
        runtime.urllib.request,
        "build_opener",
        lambda *args: SimpleNamespace(open=lambda *args, **kwargs: Response()),
    )
    return observations


def test_start_success_recreates_in_order_then_checks_empty_authenticated_client(
    initialized: Path,
    docker_observations: dict[str, object],
) -> None:
    identity = str(runtime.installation(initialized)["identity"])
    runtime.start(initialized, identity)
    calls = docker_observations["calls"]
    lifecycle = [call for call in calls if call[:2] == ["docker", "stop"]]
    assert [call[-1] for call in lifecycle[:2]] == ["c" * 64, "a" * 64]
    assert [call[-1] for call in calls if call[:2] == ["docker", "rm"]] == [
        "c" * 64,
        "a" * 64,
    ]
    assert any(call[:2] == ["docker", "compose"] and "up" in call for call in calls)


@pytest.mark.parametrize(
    "field,value",
    [
        ("queue", [{"hash": "controlled-test-transfer"}]),
        ("anonymous", "200"),
        ("egress", "1.1.1.1"),
        ("namespace", "net:[different]"),
        ("fail_up", True),
    ],
)
def test_start_failure_stops_client_before_gateway_and_preserves_state(
    initialized: Path,
    docker_observations: dict[str, object],
    field: str,
    value: object,
) -> None:
    docker_observations[field] = value
    identity = str(runtime.installation(initialized)["identity"])
    with pytest.raises(Refusal):
        runtime.start(initialized, identity)
    stops = [call for call in docker_observations["calls"] if "stop" in call]
    assert [call[-1] for call in stops][-2:] == ["c" * 64, "a" * 64]
    assert (initialized / "password").exists()


@pytest.mark.parametrize(
    "section,key,value",
    [
        ("HostConfig", "Privileged", True),
        ("HostConfig", "ReadonlyRootfs", False),
        ("HostConfig", "PortBindings", {"8080/tcp": [{"HostIp": "0.0.0.0"}]}),
        ("HostConfig", "CapAdd", ["CAP_NET_ADMIN"]),
        ("HostConfig", "Memory", 0),
        ("HostConfig", "NetworkMode", "bridge"),
        ("Config", "User", "0:0"),
    ],
)
def test_verify_rejects_effective_client_drift(
    initialized: Path,
    docker_observations: dict[str, object],
    section: str,
    key: str,
    value: object,
) -> None:
    docker_observations["containers"][1][section][key] = value
    identity = str(runtime.installation(initialized)["identity"])
    with pytest.raises(Refusal):
        runtime.verify(initialized, identity)


@pytest.mark.parametrize("operation", ["start", "status", "stop"])
def test_cli_dispatches_real_lifecycle_functions(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["local_retrieval.py", operation, "--storage", str(initialized.parent)],
    )
    assert runtime.main() == 0


@pytest.mark.parametrize("operation", ["init", "status", "stop"])
def test_cli_refuses_missing_input_categorically(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, operation: str
) -> None:
    monkeypatch.setattr(
        sys, "argv", ["local_retrieval.py", operation, "--storage", str(tmp_path)]
    )
    assert runtime.main() == 1


@pytest.mark.parametrize("operation", ["migrate", "saved-preflight", ""])
def test_cli_rejects_removed_or_unknown_operations_before_touching_storage(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, operation: str
) -> None:
    monkeypatch.setattr(
        sys, "argv", ["local_retrieval.py", operation, "--storage", str(tmp_path)]
    )
    with pytest.raises(SystemExit) as refusal:
        runtime.main()
    assert refusal.value.code == 2
    assert list(tmp_path.iterdir()) == []


def test_network_inventory_handles_null_ipam_and_preserves_foreign_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = "a" * 16
    routes = [
        {"dst": "default", "dev": "uplink"},
        {"dst": "10.231.200.0/24", "dev": "br-123456789012"},
        {"dst": "10.231.200.0/24", "dev": "foreign-interface"},
    ]
    networks = [
        {
            "Id": "123456789012extra",
            "Labels": {"com.docker.compose.project": "pctv-retrieval-" + identity},
            "IPAM": {"Config": [{"Subnet": "10.231.200.0/24"}]},
        },
        {"Id": "host", "Labels": None, "IPAM": {"Config": None}},
        {
            "Id": "foreign",
            "Labels": {},
            "IPAM": {"Config": [{"Subnet": "172.19.0.0/16"}]},
        },
    ]

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        value = (
            json.dumps(routes)
            if arguments[0] == "ip"
            else ("id1\nid2\nid3\n" if "ls" in arguments else json.dumps(networks))
        )
        return subprocess.CompletedProcess(arguments, 0, value, "")

    monkeypatch.setattr(subprocess, "run", run)
    observed = runtime.network_inventory(identity)
    assert observed.count("10.231.200.0/24") == 1
    assert "172.19.0.0/16" in observed
    assert "default" not in observed


def test_vpn_interface_collision_is_refused_before_mutation(initialized: Path) -> None:
    manifest = runtime.installation(initialized)
    candidate = str(manifest["subnet"])
    address = candidate.split("/")[0].rsplit(".", 1)[0] + ".2/24"
    path = initialized / "wg0.conf"
    path.write_text(path.read_text().replace("10.7.0.2/32", address))
    with pytest.raises(Refusal, match="network_subnet_collision"):
        runtime.verify_network_plan(initialized, str(manifest["identity"]))


@pytest.mark.parametrize(
    "cookie,body,accepted",
    [
        ("SID=legacySession", "Ok.", True),
        ("QBT_SID_8080=modern+Session/=", "", True),
        ("OTHER=unknown", "Ok.", False),
        ('SID=bad"cookie', "Ok.", False),
        ("SID=generatedSession", "Fails.", False),
    ],
)
def test_authentication_cookie_contract(
    initialized: Path,
    docker_observations: dict[str, object],
    cookie: str,
    body: str,
    accepted: bool,
) -> None:
    docker_observations["login"] = (
        "HTTP/1.1 200 OK\r\nSet-Cookie: " + cookie + "; HttpOnly\r\n\r\n" + body
    )
    identity = str(runtime.installation(initialized)["identity"])
    if accepted:
        assert runtime.authenticate(initialized, identity)["dht"] is False
    else:
        with pytest.raises(Refusal, match="client_authentication"):
            runtime.authenticate(initialized, identity)


@pytest.mark.parametrize("operation", ["start", "status", "stop"])
@pytest.mark.parametrize(
    "damaged",
    ["wg0.conf", "password", "credential.json", "config/qBittorrent/qBittorrent.conf"],
)
def test_cli_stops_owned_services_despite_damaged_runtime_files(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
    damaged: str,
) -> None:
    (initialized / damaged).unlink()
    monkeypatch.setattr(
        sys, "argv", ["retrieval", operation, "--storage", str(initialized.parent)]
    )

    assert runtime.main() == (0 if operation == "stop" else 1)

    calls = docker_observations["calls"]
    lifecycle = [call for call in calls if call[:2] == ["docker", "stop"]]
    assert [call[-1] for call in lifecycle] == ["c" * 64, "a" * 64]
    assert all("stop" in call for call in lifecycle)
    assert (initialized / "installation.json").exists()


@pytest.mark.parametrize("operation", ["start", "status", "stop"])
@pytest.mark.parametrize(
    "expiry", ["2000-01-01T00:00:00+00:00", "2099-01-01T00:00:00", "invalid"]
)
def test_cli_refuses_invalid_or_expired_credentials_but_preserves_stop(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
    expiry: str,
) -> None:
    metadata = initialized / "credential.json"
    metadata.write_text(
        json.dumps({"name": "local-retrieval-operator", "expires_at": expiry})
    )
    password = (initialized / "password").read_bytes()
    monkeypatch.setattr(
        sys, "argv", ["retrieval", operation, "--storage", str(initialized.parent)]
    )

    assert runtime.main() == (0 if operation == "stop" else 1)

    lifecycle = [
        call for call in docker_observations["calls"] if call[:2] == ["docker", "stop"]
    ]
    assert [call[-1] for call in lifecycle] == ["c" * 64, "a" * 64]
    assert all("stop" in call for call in lifecycle)
    assert (initialized / "password").read_bytes() == password


@pytest.mark.parametrize(
    "field,value",
    [("namespace", "net:[foreign]"), ("egress", "1.1.1.1"), ("anonymous", "200")],
)
def test_status_verification_failure_stops_owned_services(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    field: str,
    value: str,
) -> None:
    docker_observations[field] = value
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "status", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 1

    lifecycle = [
        call for call in docker_observations["calls"] if call[:2] == ["docker", "stop"]
    ]
    assert [call[-1] for call in lifecycle] == ["c" * 64, "a" * 64]
    assert all("stop" in call for call in lifecycle)


def test_status_reports_unconfirmed_cleanup_after_attempting_both_services(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    docker_observations["namespace"] = "net:[foreign]"
    docker_observations["fail_stop"] = True
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "status", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 1

    lifecycle = [
        call for call in docker_observations["calls"] if call[:2] == ["docker", "stop"]
    ]
    assert [call[-1] for call in lifecycle] == ["c" * 64, "a" * 64]
    assert "verification_and_cleanup_failed" in caplog.text
    assert (initialized / "password").read_text() not in caplog.text


@pytest.mark.parametrize(
    "setting",
    [
        "FIREWALL=off",
        "FIREWALL_OUTBOUND_SUBNETS=0.0.0.0/0",
        "DNS_SERVER=off",
        "WIREGUARD_MTU=9000",
    ],
)
def test_status_rejects_unapproved_gateway_environment_and_stops(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    setting: str,
) -> None:
    docker_observations["containers"][0]["Config"]["Env"].append(setting)
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "status", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 1

    stops = [call for call in docker_observations["calls"] if "stop" in call]
    assert [call[-1] for call in stops] == ["c" * 64, "a" * 64]


def test_start_rejects_downloads_symlink_before_attaching_writable_bind(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    downloads = initialized / "downloads"
    downloads.rmdir()
    foreign = tmp_path / "foreign-library"
    foreign.mkdir()
    downloads.symlink_to(foreign, target_is_directory=True)
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "start", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 1

    assert not any("up" in call for call in docker_observations["calls"])
    assert not any(foreign.iterdir())


@pytest.mark.parametrize("directory", ["downloads", "config", "config/qBittorrent"])
def test_preflight_refuses_writable_directory_with_unsafe_permissions(
    initialized: Path, directory: str
) -> None:
    (initialized / directory).chmod(0o755)
    with pytest.raises(Refusal, match="writable_directory_unsafe"):
        runtime.installation(initialized)
    assert "identity" in runtime.installation(initialized, require_reserve=False)


def test_preflight_refuses_nested_mount_but_preserves_emergency_stop_identity(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        observed = previous_run(arguments, **kwargs)
        if arguments[0] == "findmnt" and "--submounts" in arguments:
            payload = json.loads(observed.stdout)
            payload["filesystems"][0]["children"] = [
                {"target": str(initialized / "downloads"), "source": "/dev/foreign"}
            ]
            return subprocess.CompletedProcess(arguments, 0, json.dumps(payload), "")
        return observed

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="storage_submounts_forbidden"):
        runtime.installation(initialized)
    assert "identity" in runtime.installation(initialized, require_reserve=False)


def test_scan_is_blocking_even_when_shell_requests_report_only(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TRIVY_EXIT", "0")
    scans: list[list[str]] = []

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        scans.append(arguments)
        if "TRIVY_EXIT=1" not in arguments:
            return subprocess.CompletedProcess(arguments, 0, "report-only", "")
        return subprocess.CompletedProcess(arguments, 1, "controlled vulnerability", "")

    identity = str(runtime.installation(initialized)["identity"])
    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="external_command_failed"):
        runtime.qualify_images(initialized, identity)
    assert len(scans) == 1
    assert "scan-docker-image" in scans[0]
    assert "TRIVY_EXIT=1" in scans[0]


@pytest.mark.parametrize("role", ["gluetun", "client"])
@pytest.mark.parametrize(
    "drift",
    [
        "volume",
        "tmpfs-size",
        "tmpfs-flags",
        "tmpfs-extra",
        "tmpfs-invalid",
        "logs",
        "entrypoint",
        "command",
        "restart",
    ],
)
def test_status_refuses_effective_execution_and_mount_drift_and_stops(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    drift: str,
) -> None:
    container = docker_observations["containers"][0 if role == "gluetun" else 1]
    host = container["HostConfig"]
    if drift == "volume":
        container["Mounts"].append(
            {
                "Type": "volume",
                "Source": "foreign-volume",
                "Destination": "/extra",
                "RW": True,
            }
        )
    elif drift == "tmpfs-size":
        host["Tmpfs"]["/tmp"] = host["Tmpfs"]["/tmp"].replace("size=32m", "size=512m")
    elif drift == "tmpfs-flags":
        host["Tmpfs"]["/tmp"] = host["Tmpfs"]["/tmp"].replace("nosuid,", "")
    elif drift == "tmpfs-extra":
        host["Tmpfs"]["/extra"] = "rw,size=1g"
    elif drift == "tmpfs-invalid":
        host["Tmpfs"] = []
    elif drift == "logs":
        host["LogConfig"]["Config"]["max-file"] = "0"
    elif drift == "entrypoint":
        container["Config"]["Entrypoint"] = ["/bin/sh"]
    elif drift == "command":
        container["Config"]["Cmd"] = ["unexpected-command"]
    else:
        host["RestartPolicy"]["Name"] = "always"
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "status", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 1

    calls = docker_observations["calls"]
    assert [call[-1] for call in calls if "stop" in call] == ["c" * 64, "a" * 64]
    assert not any("exec" in call for call in calls)


@pytest.mark.parametrize("size", ["32m", "33554432", "32768k", "32M"])
def test_status_accepts_equivalent_tmpfs_units_and_reordered_options(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
    size: str,
) -> None:
    docker_observations["containers"][0]["HostConfig"]["Tmpfs"]["/tmp"] = (
        "size=" + size + ",noexec,nodev,nosuid,rw"
    )
    monkeypatch.setattr(
        sys, "argv", ["retrieval", "status", "--storage", str(initialized.parent)]
    )

    assert runtime.main() == 0
    assert not any("stop" in call for call in docker_observations["calls"])


def test_tmpfs_rejects_duplicate_options_instead_of_masking_override() -> None:
    with pytest.raises(Refusal, match="effective_tmpfs_drift"):
        runtime.tmpfs_policy("rw,size=1g,size=32m")


def test_same_filesystem_survives_reassigned_loop_device(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    original = (initialized / "installation.json").read_bytes()
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        observed = previous_run(arguments, **kwargs)
        if arguments[0] == "findmnt":
            payload = json.loads(observed.stdout)
            payload["filesystems"][0]["source"] = "/dev/loop-after-remount"
            return subprocess.CompletedProcess(arguments, 0, json.dumps(payload), "")
        return observed

    monkeypatch.setattr(subprocess, "run", run)
    assert runtime.installation(initialized)["version"] == 2
    assert (initialized / "installation.json").read_bytes() == original


def test_replaced_filesystem_uuid_is_refused(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        observed = previous_run(arguments, **kwargs)
        if arguments[0] == "findmnt":
            payload = json.loads(observed.stdout)
            payload["filesystems"][0]["uuid"] = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
            return subprocess.CompletedProcess(arguments, 0, json.dumps(payload), "")
        return observed

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="installation_filesystem_changed"):
        runtime.installation(initialized)


@pytest.fixture
def lifecycle_backend(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> dict[str, object]:
    """Model Docker label selection and process state, including silent stop failure."""
    identity = str(runtime.installation(initialized)["identity"])
    project = "pctv-retrieval-" + identity
    backend: dict[str, object] = {
        "containers": [],
        "calls": [],
        "mutated": [],
        "silent_stop": False,
    }
    for role, identifier in (("client", "c" * 64), ("gluetun", "a" * 64)):
        backend["containers"].append(
            {
                "Id": identifier,
                "Name": "/" + project + "-" + role,
                "Config": {
                    "Labels": {
                        "org.popcorntv.retrieval": identity,
                        "com.docker.compose.project": project,
                        "com.docker.compose.service": role,
                    }
                },
                "State": {"Running": True, "Status": "running"},
            }
        )
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if arguments[0] != "docker":
            return previous_run(arguments, **kwargs)
        backend["calls"].append(arguments)
        value = ""
        if arguments[1] == "ps":
            key, wanted = (
                arguments[arguments.index("--filter") + 1]
                .removeprefix("label=")
                .split("=", 1)
            )
            value = "\n".join(
                item["Name"].lstrip("/")
                for item in backend["containers"]
                if item["Config"]["Labels"].get(key) == wanted
            )
        elif arguments[1] == "inspect":
            selected = [
                item
                for item in backend["containers"]
                if item["Id"] in arguments[2:]
                or item["Name"].lstrip("/") in arguments[2:]
            ]
            value = json.dumps(selected)
        elif arguments[1] == "stop":
            for item in backend["containers"]:
                if item["Id"] == arguments[-1]:
                    backend["mutated"].append(item["Id"])
                    if not backend["silent_stop"]:
                        item["State"] = {"Running": False, "Status": "exited"}
        elif arguments[1] == "rm":
            selected = [
                item for item in backend["containers"] if item["Id"] == arguments[-1]
            ]
            if any(item["State"]["Running"] for item in selected):
                return subprocess.CompletedProcess(
                    arguments, 1, "running container", ""
                )
            backend["mutated"].extend(item["Id"] for item in selected)
            backend["containers"] = [
                item for item in backend["containers"] if item["Id"] != arguments[-1]
            ]
        elif arguments[1] == "compose" and "stop" in arguments:
            for item in backend["containers"]:
                labels = item["Config"]["Labels"]
                if (
                    labels.get("com.docker.compose.project") == project
                    and labels.get("com.docker.compose.service") == arguments[-1]
                ):
                    backend["mutated"].append(item["Id"])
                    if not backend["silent_stop"]:
                        item["State"] = {"Running": False, "Status": "exited"}
        else:
            pytest.fail("unexpected lifecycle boundary: " + arguments[1])
        return subprocess.CompletedProcess(arguments, 0, value, "")

    monkeypatch.setattr(subprocess, "run", run)
    return backend


def test_stop_uses_proven_ids_when_compose_labels_are_missing(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    for item in lifecycle_backend["containers"]:
        item["Config"]["Labels"].pop("com.docker.compose.project")
        item["Config"]["Labels"].pop("com.docker.compose.service")
    runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    assert all(
        item["State"]["Running"] is False for item in lifecycle_backend["containers"]
    )
    assert lifecycle_backend["mutated"] == ["c" * 64, "a" * 64]


def test_foreign_compose_member_is_never_stopped(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    lifecycle_backend["containers"][0]["Config"]["Labels"].pop(
        "org.popcorntv.retrieval"
    )
    with pytest.raises(Refusal):
        runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    assert lifecycle_backend["mutated"] == []
    assert all(
        item["State"]["Running"] is True for item in lifecycle_backend["containers"]
    )


def test_stop_success_without_stopped_state_is_refused(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    lifecycle_backend["silent_stop"] = True
    with pytest.raises(Refusal, match="stop_unconfirmed"):
        runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    assert lifecycle_backend["mutated"] == ["c" * 64, "a" * 64]


def test_remove_uses_only_proven_stopped_ids_without_force_or_volume_deletion(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    identity = str(runtime.installation(initialized)["identity"])
    for item in lifecycle_backend["containers"]:
        item["Config"]["Labels"].pop("com.docker.compose.project")
        item["Config"]["Labels"].pop("com.docker.compose.service")
    runtime.stop(initialized, identity)
    runtime.remove_stopped(initialized, identity)
    removals = [
        call for call in lifecycle_backend["calls"] if call[:2] == ["docker", "rm"]
    ]
    assert removals == [["docker", "rm", "c" * 64], ["docker", "rm", "a" * 64]]
    assert lifecycle_backend["containers"] == []
    assert (initialized / "password").is_file()


def test_remove_refuses_running_containers_without_mutation(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    with pytest.raises(Refusal, match="removal_requires_stopped_services"):
        runtime.remove_stopped(
            initialized, str(runtime.installation(initialized)["identity"])
        )
    assert lifecycle_backend["mutated"] == []


def test_remove_refuses_foreign_compose_member_without_mutation(
    initialized: Path, lifecycle_backend: dict[str, object]
) -> None:
    lifecycle_backend["containers"][0]["Config"]["Labels"].pop(
        "org.popcorntv.retrieval"
    )
    with pytest.raises(Refusal):
        runtime.remove_stopped(
            initialized, str(runtime.installation(initialized)["identity"])
        )
    assert lifecycle_backend["mutated"] == []


@pytest.mark.parametrize("field", ["id", "nonce", "project", "service", "state"])
def test_ownership_proof_refuses_inconsistent_inspection_before_mutation(
    initialized: Path, lifecycle_backend: dict[str, object], field: str
) -> None:
    item = lifecycle_backend["containers"][0]
    if field == "id":
        item["Id"] = "not-an-immutable-id"
    elif field == "state":
        item["State"] = None
    else:
        key = {
            "nonce": "org.popcorntv.retrieval",
            "project": "com.docker.compose.project",
            "service": "com.docker.compose.service",
        }[field]
        item["Config"]["Labels"][key] = "foreign"
    with pytest.raises(Refusal):
        runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    assert lifecycle_backend["mutated"] == []


def test_name_replacement_during_stop_never_targets_the_replacement(
    initialized: Path,
    lifecycle_backend: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    previous_run = subprocess.run

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        if arguments[:2] == ["docker", "stop"] and arguments[-1] == "c" * 64:
            lifecycle_backend["containers"][0]["Id"] = "f" * 64
        return previous_run(arguments, **kwargs)

    monkeypatch.setattr(subprocess, "run", run)
    with pytest.raises(Refusal, match="stop_unconfirmed"):
        runtime.stop(initialized, str(runtime.installation(initialized)["identity"]))
    assert "f" * 64 not in lifecycle_backend["mutated"]
    assert lifecycle_backend["containers"][0]["State"]["Running"] is True
    assert lifecycle_backend["containers"][1]["State"]["Running"] is False


def test_root_operator_cannot_initialize_a_root_running_client(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(os, "getuid", lambda: 0)
    with pytest.raises(Refusal, match="non_root_operator_required"):
        runtime.initialize(tmp_path / "not-yet-mounted", tmp_path / "absent-input")
    assert not (tmp_path / "not-yet-mounted").exists()


def test_root_operator_cannot_render_a_root_running_client(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_fstat = os.fstat

    def root_owned_file(descriptor: int) -> os.stat_result:
        values = list(real_fstat(descriptor))
        values[4] = 0
        return os.stat_result(values)

    monkeypatch.setattr(os, "getuid", lambda: 0)
    monkeypatch.setattr(os, "fstat", root_owned_file)
    with pytest.raises(Refusal, match="non_root_operator_required"):
        runtime.compose_model(initialized, "a" * 16)


def test_arm64_model_selects_qualified_immutable_pins(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runtime.platform, "machine", lambda: "aarch64")
    identity = str(runtime.installation(initialized)["identity"])
    model = json.loads(json.dumps(runtime.compose_model(initialized, identity)))
    assert {
        name: (service["image"], service["platform"], service["pull_policy"])
        for name, service in model["services"].items()
    } == {
        name: (image, "linux/arm64", "never")
        for name, image in runtime.ARM64_RETRIEVAL_IMAGES.items()
    }
    calls: list[list[str]] = []

    def inspect(arguments: list[str]) -> str:
        calls.append(arguments)
        return "linux/amd64"

    monkeypatch.setattr(runtime, "command", inspect)
    with pytest.raises(Refusal, match="retrieval_image_platform"):
        runtime.qualify_images(initialized, identity)
    assert calls == [
        [
            "docker",
            "image",
            "inspect",
            "--format",
            "{{.Os}}/{{.Architecture}}",
            runtime.ARM64_RETRIEVAL_IMAGES["gluetun"],
        ]
    ]


def test_arm64_images_of_the_right_platform_are_still_scanned(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runtime.platform, "machine", lambda: "arm64")
    identity = str(runtime.installation(initialized)["identity"])
    calls: list[list[str]] = []

    def observe(arguments: list[str]) -> str:
        calls.append(arguments)
        return "linux/arm64\n" if arguments[0] == "docker" else ""

    monkeypatch.setattr(runtime, "command", observe)
    runtime.qualify_images(initialized, identity)
    scanned = [call[-1] for call in calls if call[0] == "make"]
    assert sorted(scanned) == sorted(
        "IMAGE=" + image for image in runtime.ARM64_RETRIEVAL_IMAGES.values()
    )
    assert all("TRIVY_EXIT=1" in call for call in calls if call[0] == "make")


@pytest.mark.parametrize("architecture", ["x86_64", "amd64"])
def test_amd64_model_keeps_the_composition_pins(
    initialized: Path, monkeypatch: pytest.MonkeyPatch, architecture: str
) -> None:
    monkeypatch.setattr(runtime.platform, "machine", lambda: architecture)
    identity = str(runtime.installation(initialized)["identity"])
    model = json.loads(json.dumps(runtime.compose_model(initialized, identity)))
    reviewed = json.loads(
        (runtime.ROOT / "deploy/local-retrieval/compose.json").read_text()
    )
    for name, service in model["services"].items():
        assert service["image"] == reviewed["services"][name]["image"]
        assert "platform" not in service


@pytest.mark.parametrize("architecture", ["riscv64", "armv7l", ""])
def test_unqualified_architecture_is_refused_before_any_process(
    initialized: Path, monkeypatch: pytest.MonkeyPatch, architecture: str
) -> None:
    identity = str(runtime.installation(initialized)["identity"])
    monkeypatch.setattr(runtime.platform, "machine", lambda: architecture)
    monkeypatch.setattr(
        runtime, "command", lambda arguments: pytest.fail("process started")
    )
    with pytest.raises(Refusal, match="retrieval_architecture_unqualified"):
        runtime.compose_model(initialized, identity)


def test_interrupted_start_stops_client_before_gateway_and_stays_interrupted(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = str(runtime.installation(initialized)["identity"])

    def interrupted(root: Path, owner: str) -> None:
        raise KeyboardInterrupt

    monkeypatch.setattr(runtime, "verify", interrupted)
    with pytest.raises(KeyboardInterrupt):
        runtime.start(initialized, identity)
    stops = [call for call in docker_observations["calls"] if "stop" in call]
    assert [call[-1] for call in stops][-2:] == ["c" * 64, "a" * 64]
    assert (initialized / "password").exists()


def test_interrupted_start_reports_an_unconfirmed_cleanup(
    initialized: Path,
    docker_observations: dict[str, object],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    identity = str(runtime.installation(initialized)["identity"])

    def interrupted(root: Path, owner: str) -> None:
        docker_observations["fail_stop"] = True
        raise KeyboardInterrupt

    monkeypatch.setattr(runtime, "verify", interrupted)
    with pytest.raises(Refusal, match="startup_and_cleanup_failed"):
        runtime.start(initialized, identity)


@pytest.mark.parametrize("relation", ["same", "library_inside", "mount_inside"])
def test_storage_sharing_a_tree_with_the_library_is_refused_before_any_write(
    initialized: Path, monkeypatch: pytest.MonkeyPatch, relation: str
) -> None:
    mount = initialized.parent
    library = {
        "same": mount,
        "library_inside": mount / "films",
        "mount_inside": mount.parent,
    }[relation]
    before = sorted(path.name for path in initialized.iterdir())
    monkeypatch.setenv("MEDIA_ROOT", str(library))
    with pytest.raises(Refusal, match="storage_inside_media_root"):
        runtime.installation(initialized)
    with pytest.raises(Refusal, match="storage_inside_media_root"):
        runtime.initialize(mount, mount.parent / "source")
    assert sorted(path.name for path in initialized.iterdir()) == before


def test_library_misplacement_never_blocks_the_emergency_stop_identity(
    initialized: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MEDIA_ROOT", str(initialized.parent))
    assert runtime.installation(initialized, require_reserve=False)["version"] == 2


def test_unrelated_library_keeps_the_installation_usable(
    initialized: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path / "mount-library"))
    assert runtime.installation(initialized)["version"] == 2
