"""Exercise private state and configuration reconciliation without real providers."""

from __future__ import annotations

import contextlib
import ipaddress
import json
import logging
import os
import socket
import stat
import subprocess
import sys
import threading
from collections.abc import Iterator
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

import local_discovery as discovery
import pytest


@pytest.fixture
def installation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> discovery.Installation:
    """Use actual private files while substituting only Docker/host network inventory."""
    monkeypatch.setattr(discovery, "occupied_networks", list)
    return discovery.initialize(tmp_path / "state")


def test_private_initialization_is_idempotent(
    installation: discovery.Installation,
) -> None:
    loaded = discovery.initialize(installation.root)
    assert loaded == installation
    assert stat.S_IMODE(installation.root.stat().st_mode) == 0o700
    for service in discovery.SERVICES:
        config = installation.root / service.name / "config.xml"
        assert stat.S_IMODE(config.stat().st_mode) == 0o600
        assert installation.credentials[service.name].api_key in config.read_text()
        assert installation.credentials[service.name].password not in config.read_text()
    for credential in installation.credentials.values():
        assert credential.password not in installation.environment().values()
        assert credential.api_key not in installation.environment().values()
        assert credential.password not in repr(installation)
        assert credential.api_key not in repr(credential)


@pytest.mark.parametrize(
    "kind", ["root-link", "parent-link", "public-dir", "incomplete"]
)
def test_untrusted_state_refused_without_reset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, kind: str
) -> None:
    monkeypatch.setattr(discovery, "occupied_networks", list)
    target = tmp_path / "existing"
    target.mkdir(mode=0o700)
    marker = target / "keep.txt"
    marker.write_text("owner state")
    if kind == "root-link":
        path = tmp_path / "alias"
        path.symlink_to(target)
    elif kind == "parent-link":
        parent = tmp_path / "alias"
        parent.symlink_to(target)
        path = parent / "new"
    else:
        path = target
        if kind == "public-dir":
            target.chmod(0o755)
    with pytest.raises((discovery.DiscoveryError, FileNotFoundError)):
        discovery.initialize(path)
    assert marker.read_text() == "owner state"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("schema", 2),
        ("identity", "../foreign"),
        ("uid", -1),
        ("gid", -1),
        ("subnet", "192.0.2.0/29"),
        ("subnet", "10.203.206.0/24"),
    ],
)
def test_invalid_manifest_refused(
    installation: discovery.Installation, field: str, value: object
) -> None:
    path = installation.root / "installation.json"
    content = json.loads(path.read_text())
    content[field] = value
    path.write_text(json.dumps(content))
    with pytest.raises(discovery.DiscoveryError):
        discovery.load_installation(installation.root)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("username", "other"),
        ("password", "short"),
        ("api_key", "bad"),
        ("expires_at", "2020-01-01T00:00:00+00:00"),
        ("expires_at", "2099-01-01T00:00:00"),
    ],
)
def test_invalid_credentials_refused(
    installation: discovery.Installation, field: str, value: str
) -> None:
    path = installation.root / "prowlarr-credentials.json"
    content = json.loads(path.read_text())
    content[field] = value
    path.write_text(json.dumps(content))
    with pytest.raises(discovery.DiscoveryError):
        discovery.load_installation(installation.root)


def test_private_file_symlink_and_public_credentials_refused(
    installation: discovery.Installation,
) -> None:
    path = installation.root / "prowlarr-credentials.json"
    path.chmod(0o644)
    with pytest.raises(discovery.DiscoveryError):
        discovery.load_installation(installation.root)
    path.chmod(0o600)
    alias = installation.root / "alias"
    alias.symlink_to(path)
    with pytest.raises(discovery.DiscoveryError):
        discovery.private_path(alias, directory=False)
    with pytest.raises(FileExistsError):
        discovery.write_private(path, "overwrite forbidden")
    with pytest.raises(FileExistsError):
        discovery.write_private(alias, "symlink write forbidden")


def test_subnet_selection_rejects_overlap_and_exhaustion() -> None:
    choose = discovery.choose_subnet
    first = ipaddress.IPv4Network("10.203.206.0/29")
    assert choose([]) == first
    assert choose([first]) == ipaddress.IPv4Network("10.203.206.8/29")
    with pytest.raises(discovery.DiscoveryError):
        choose([ipaddress.IPv4Network("10.203.0.0/16")])


def test_lock_refuses_overlap_and_releases(
    installation: discovery.Installation,
) -> None:
    with (
        discovery.installation_lock(installation),
        pytest.raises(discovery.DiscoveryError),
        discovery.installation_lock(installation),
    ):
        pytest.fail("overlapping lock acquired")
    with discovery.installation_lock(installation):
        pass


class FakeArr:
    """Local HTTP boundary with stateful accepted/rejected/uncertain config writes."""

    def __init__(self, credential: discovery.Credential) -> None:
        self.credential = credential
        self.host: dict[str, object] = {"authenticationMethod": "forms", "username": ""}
        self.indexer: dict[str, object] = {"rssSyncInterval": 15}
        self.entries: list[object] = []
        self.writes: list[str] = []
        self.lose_response = False
        self.reject_write = False
        self.bad_login = False

    @contextlib.contextmanager
    def serve(self, api: discovery.Api) -> Iterator[None]:
        """Use actual HTTP parsing, proxy/redirect containment and response limits."""
        model = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args: object) -> None:
                pass

            def respond(self, status: int, value: object) -> None:
                content = json.dumps(value).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)

            def do_GET(self) -> None:
                valid_key = self.headers.get("X-Api-Key") == model.credential.api_key
                cookies = SimpleCookie()
                cookies.load(self.headers.get("Cookie", ""))
                valid_cookie = (
                    "fixture" in cookies and cookies["fixture"].value == "authorized"
                )
                if self.path == "/":
                    self.respond(200 if valid_cookie else 401, {})
                    return
                if not valid_key:
                    self.respond(401, {})
                elif self.path.endswith("/config/host"):
                    self.respond(200, model.host)
                elif self.path.endswith("/config/indexer"):
                    self.respond(200, model.indexer)
                elif self.path.endswith("/oversized"):
                    self.respond(200, "x" * (discovery.MAX_RESPONSE + 1))
                else:
                    self.respond(200, model.entries)

            def do_PUT(self) -> None:
                if model.reject_write:
                    self.respond(400, {})
                    return
                content = self.rfile.read(int(self.headers["Content-Length"]))
                value = discovery.object_map(json.loads(content))
                model.writes.append(self.path)
                if self.path.endswith("/config/host"):
                    model.host.update(value)
                elif self.path.endswith("/config/indexer"):
                    model.indexer.update(value)
                if model.lose_response:
                    self.connection.shutdown(socket.SHUT_RDWR)
                    self.connection.close()
                else:
                    self.respond(200, value)

            def do_POST(self) -> None:
                content = self.rfile.read(int(self.headers["Content-Length"]))
                form = parse_qs(content.decode())
                if (
                    model.bad_login
                    or model.host.get("username") != model.credential.username
                    or form.get("username") != [model.credential.username]
                    or form.get("password") != [model.credential.password]
                ):
                    self.respond(401, {})
                else:
                    self.send_response(302)
                    self.send_header("Location", "/")
                    self.send_header("Set-Cookie", "nonce=fixture; HttpOnly")
                    self.send_header("Set-Cookie", "fixture=authorized; HttpOnly")
                    self.end_headers()

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        api.base = f"http://127.0.0.1:{server.server_port}"
        thread.start()
        try:
            yield
        finally:
            server.shutdown()
            thread.join(timeout=2)
            server.server_close()


@pytest.mark.parametrize("service", discovery.SERVICES, ids=lambda item: item.name)
@pytest.mark.parametrize("lose_response", [False, True])
def test_configuration_reconciles_accepted_writes_once(
    installation: discovery.Installation,
    service: discovery.Service,
    lose_response: bool,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    api = discovery.Api(installation, service)
    model = FakeArr(api.credential)
    model.lose_response = lose_response
    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:1")
    with model.serve(api), caplog.at_level(logging.INFO):
        discovery.configure(api)
        writes = list(model.writes)
        discovery.configure(api)
    assert model.writes == writes
    assert len(writes) == (2 if service.name == "radarr" else 1)
    assert model.host["authenticationRequired"] == "enabled"
    assert api.credential.api_key not in caplog.text
    assert api.credential.password not in caplog.text
    if service.name == "radarr":
        assert model.indexer["rssSyncInterval"] == 0


def test_rejected_write_does_not_retry_or_reset(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    model = FakeArr(api.credential)
    model.reject_write = True
    with model.serve(api), pytest.raises(discovery.DiscoveryError):
        discovery.configure(api)
    assert not model.writes
    assert model.host == {"authenticationMethod": "forms", "username": ""}


def test_nonempty_owner_state_is_preserved(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    model = FakeArr(api.credential)
    model.entries = [{"id": 1, "name": "owner edit"}]
    with model.serve(api), pytest.raises(discovery.DiscoveryError, match="not empty"):
        discovery.configure(api)
    assert not model.writes
    assert len(model.entries) == 1


@pytest.mark.parametrize(
    "path", ["https://foreign.example/", "//foreign/", "/x?key=y", "/x\n"]
)
def test_arbitrary_api_destinations_refused(
    installation: discovery.Installation,
    path: str,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    with pytest.raises(discovery.DiscoveryError, match="fixed API path"):
        api.request(path)


def test_oversized_response_and_failed_login_refused(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    model = FakeArr(api.credential)
    with model.serve(api):
        with pytest.raises(discovery.DiscoveryError, match="size budget"):
            api.request("/oversized")
        model.bad_login = True
        with pytest.raises(discovery.DiscoveryError, match="login not verified"):
            discovery.configure(api)


@pytest.mark.parametrize(
    "endpoint", ["ssh://operator@remote", "tcp://127.0.0.1:2375", "https://remote:2376"]
)
def test_remote_docker_endpoint_refused_before_any_connection(
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
) -> None:
    discovery.local_docker_endpoint.cache_clear()
    monkeypatch.setenv("DOCKER_HOST", endpoint)
    monkeypatch.delenv("DOCKER_CONTEXT", raising=False)
    with pytest.raises(discovery.DiscoveryError, match="remote Docker"):
        discovery.local_docker_endpoint()
    discovery.local_docker_endpoint.cache_clear()


def test_remote_selected_context_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    discovery.local_docker_endpoint.cache_clear()
    monkeypatch.delenv("DOCKER_HOST", raising=False)
    monkeypatch.setenv("DOCKER_CONTEXT", "remote")
    calls: list[list[str]] = []

    def inspect(
        arguments: list[str], **_kwargs: object
    ) -> subprocess.CompletedProcess[str]:
        calls.append(arguments)
        return subprocess.CompletedProcess(arguments, 0, "ssh://remote\n", "")

    monkeypatch.setattr(subprocess, "run", inspect)
    with pytest.raises(discovery.DiscoveryError, match="remote Docker"):
        discovery.local_docker_endpoint()
    assert len(calls) == 1
    assert calls[0][:3] == ["docker", "context", "inspect"]
    discovery.local_docker_endpoint.cache_clear()


def test_command_failure_and_timeout_are_sanitized(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert discovery.command([sys.executable, "-c", "print('ok')"]).strip() == "ok"
    secret = "fixture-not-a-real-key"
    with pytest.raises(discovery.DiscoveryError) as result:
        discovery.command(
            [sys.executable, "-c", f"print({secret!r}); raise SystemExit(3)"]
        )
    assert secret not in str(result.value)
    monkeypatch.setattr(discovery, "COMMAND_TIMEOUT", 0.05)
    with pytest.raises(discovery.DiscoveryError, match="timed out"):
        discovery.command([sys.executable, "-c", "import time; time.sleep(10)"])


def test_stop_identity_does_not_require_live_credentials(
    installation: discovery.Installation,
) -> None:
    path = installation.root / "prowlarr-credentials.json"
    data = json.loads(path.read_text())
    data["expires_at"] = "2020-01-01T00:00:00+00:00"
    path.write_text(json.dumps(data))
    with pytest.raises(discovery.DiscoveryError, match="rotation due"):
        discovery.load_installation(installation.root)
    identity = discovery.load_identity(installation.root)
    assert identity.identity == installation.identity
    assert identity.credentials == {}


def test_completed_configuration_drift_is_refused_without_writes(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[1])
    model = FakeArr(api.credential)
    with model.serve(api):
        discovery.configure(api)
        writes = list(model.writes)
        model.host["analyticsEnabled"] = True
        with pytest.raises(discovery.DiscoveryError, match="settings changed"):
            discovery.verify_configuration(api)
        assert model.writes == writes
        assert model.host["analyticsEnabled"] is True
        model.host["analyticsEnabled"] = False
        model.indexer["rssSyncInterval"] = 15
        with pytest.raises(discovery.DiscoveryError, match="RSS settings changed"):
            discovery.verify_configuration(api)
        assert model.writes == writes


def test_completed_marker_is_owned_and_not_a_symlink(
    installation: discovery.Installation,
) -> None:
    marker = installation.root / "bootstrap-complete.json"
    assert not discovery.bootstrap_completed(installation)
    discovery.write_private(
        marker, json.dumps({"schema": 1, "identity": installation.identity})
    )
    assert discovery.bootstrap_completed(installation)
    marker.write_text('{"schema":1,"identity":"other"}')
    with pytest.raises(discovery.DiscoveryError):
        discovery.bootstrap_completed(installation)
    marker.unlink()
    marker.symlink_to(installation.root / "installation.json")
    with pytest.raises(discovery.DiscoveryError, match="symlink"):
        discovery.bootstrap_completed(installation)


@pytest.fixture
def controller(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[dict[str, FakeArr], list[list[str]]]]:
    """Real HTTP/config/filesystem behavior with only Docker and port IO substituted."""
    calls: list[list[str]] = []
    apis: dict[str, discovery.Api] = {}
    models: dict[str, FakeArr] = {}
    with contextlib.ExitStack() as stack:
        for service in discovery.SERVICES:
            api = discovery.Api(installation, service)
            model = FakeArr(api.credential)
            stack.enter_context(model.serve(api))
            apis[service.name], models[service.name] = api, model

        state = {"started": False, "published": False}

        def api_boundary(
            _installation: discovery.Installation,
            service: discovery.Service,
            *,
            published: bool = False,
            port: int | None = None,
        ) -> discovery.Api:
            return apis[service.name]

        def container_inventory() -> list[dict[str, object]]:
            rows: list[dict[str, object]] = []
            for name in [*(service.name for service in discovery.SERVICES), "ingress"]:
                networks: dict[str, object] = {
                    installation.project + "_discovery": {
                        "IPAddress": str(installation.subnet[6])
                        if name == "ingress"
                        else installation.address(
                            next(
                                service
                                for service in discovery.SERVICES
                                if service.name == name
                            )
                        )
                    }
                }
                ports: dict[str, object] = {}
                if state["published"] and name == "ingress":
                    networks[installation.project + "_ingress"] = {
                        "IPAddress": str(discovery.load_ingress_subnet(installation)[2])
                    }
                    ports = {
                        f"{service.port}/tcp": [
                            {"HostIp": "127.0.0.1", "HostPort": str(service.host_port)}
                        ]
                        for service in discovery.SERVICES
                    }
                rows.append(
                    {
                        "Id": "fixture-" + name,
                        "Config": {
                            "Labels": {
                                "com.docker.compose.project": installation.project,
                                "com.docker.compose.service": name,
                                "io.popcorntv.discovery.install": installation.identity,
                            }
                        },
                        "Mounts": [
                            {
                                "Destination": "/etc/caddy/Caddyfile"
                                if name == "ingress"
                                else "/config",
                                "Source": str(
                                    installation.root
                                    / (
                                        "ingress.Caddyfile"
                                        if name == "ingress"
                                        else name
                                    )
                                ),
                            }
                        ],
                        "NetworkSettings": {"Networks": networks, "Ports": ports},
                    }
                )
            return rows

        def docker_boundary(arguments: list[str], **_kwargs: object) -> str:
            calls.append(arguments)
            if "--images" in arguments:
                return (
                    "lscr.io/linuxserver/prowlarr:1.0@sha256:"
                    + "a" * 64
                    + "\n"
                    + discovery.RADARR_TAG
                    + "\n"
                    + discovery.CADDY_IMAGE
                )
            if arguments[:3] == ["docker", "image", "inspect"]:
                ingress = arguments[3] == discovery.CADDY_IMAGE
                return json.dumps(
                    [
                        {
                            "Id": "sha256:" + ("c" if ingress else "b") * 64,
                            "Config": {
                                "Labels": {
                                    "org.opencontainers.image.revision": discovery.CADDY_REVISION
                                    if ingress
                                    else discovery.RADARR_REVISION,
                                    "io.popcorntv.radarr.imagesharp": "3.2.0",
                                }
                            },
                        }
                    ]
                )
            if arguments[:3] == ["docker", "network", "inspect"]:
                ingress = arguments[3].endswith("_ingress")
                return json.dumps(
                    [
                        {
                            "Internal": not ingress,
                            "EnableIPv6": False,
                            "Labels": {
                                "com.docker.compose.project": installation.project,
                                "com.docker.compose.network": "ingress"
                                if ingress
                                else "discovery",
                            },
                            "IPAM": {
                                "Config": [
                                    {
                                        "Subnet": str(
                                            discovery.load_ingress_subnet(installation)
                                            if ingress
                                            else installation.subnet
                                        )
                                    }
                                ]
                            },
                        }
                    ]
                )
            if arguments[:2] == ["docker", "ps"]:
                return (
                    " ".join(
                        "fixture-" + name for name in ("prowlarr", "radarr", "ingress")
                    )
                    if state["started"]
                    else ""
                )
            if arguments[:2] == ["docker", "inspect"]:
                return json.dumps(container_inventory())
            if arguments[:2] == ["docker", "compose"] and "up" in arguments:
                state["started"] = True
                state["published"] = str(discovery.PUBLISH) in arguments
            return ""

        monkeypatch.setattr(discovery, "Api", api_boundary)
        monkeypatch.setattr(discovery, "command", docker_boundary)
        monkeypatch.setattr(
            discovery, "check_ports", lambda _owned=None, *, ports=None: None
        )
        yield models, calls


def test_private_bootstrap_completes_before_publishing_and_rerun_is_read_only(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
) -> None:
    models, calls = controller
    discovery.start(installation)
    assert discovery.bootstrap_completed(installation)
    assert any(str(discovery.PUBLISH) in call for call in calls)
    assert all(
        "--env-file" in call and "/dev/null" in call
        for call in calls
        if call[:2] == ["docker", "compose"]
    )
    writes = {name: list(model.writes) for name, model in models.items()}
    discovery.start(installation)
    assert {name: model.writes for name, model in models.items()} == writes


def test_failed_auth_never_publishes_ports(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
) -> None:
    models, calls = controller
    models["prowlarr"].bad_login = True
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert not any(str(discovery.PUBLISH) in call for call in calls)
    assert not discovery.bootstrap_completed(installation)
    assert any("--force-recreate" in call for call in calls)


def test_interrupted_publication_keeps_primary_error_and_attempts_stop(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _models, calls = controller
    original = discovery.command

    def failed_transport(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        if str(discovery.PUBLISH) in arguments:
            calls.append(arguments)
            raise KeyboardInterrupt("fixture interruption")
        if "--force-recreate" in arguments or "stop" in arguments:
            calls.append(arguments)
            raise discovery.DiscoveryError("fixture cleanup failure")
        return original(arguments, env=env)

    monkeypatch.setattr(discovery, "command", failed_transport)
    with (
        caplog.at_level(logging.ERROR),
        pytest.raises(KeyboardInterrupt, match="fixture interruption"),
    ):
        discovery.start(installation)
    assert any("stop" in call for call in calls)
    assert "stop unconfirmed" in caplog.text
    assert installation.root.exists()


def test_image_scan_failure_prevents_any_start(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _models, calls = controller
    original = discovery.command

    def rejected_image(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        if arguments[0] == "make":
            calls.append(arguments)
            raise discovery.DiscoveryError("blocking scan")
        return original(arguments, env=env)

    monkeypatch.setattr(discovery, "command", rejected_image)
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert not any("up" in call for call in calls)
    assert not discovery.bootstrap_completed(installation)


def test_sigterm_during_publication_withdraws_ports_and_restores_handler(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import signal

    _models, calls = controller
    original = discovery.command
    previous = signal.getsignal(signal.SIGTERM)

    def interrupted_transport(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        if str(discovery.PUBLISH) in arguments:
            calls.append(arguments)
            signal.raise_signal(signal.SIGTERM)
        return original(arguments, env=env)

    monkeypatch.setattr(discovery, "command", interrupted_transport)
    with pytest.raises(discovery.DiscoveryInterrupted), discovery.termination_guard():
        discovery.start(installation)
    assert signal.getsignal(signal.SIGTERM) == previous
    assert any("--force-recreate" in call for call in calls)
    assert installation.root.exists()


def test_completed_start_refuses_owner_drift_without_rewriting(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
) -> None:
    models, calls = controller
    discovery.start(installation)
    models["radarr"].host["logLevel"] = "Debug"
    writes = {name: list(model.writes) for name, model in models.items()}
    calls.clear()
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert models["radarr"].host["logLevel"] == "Debug"
    assert {name: model.writes for name, model in models.items()} == writes
    assert not any(str(discovery.PUBLISH) in call for call in calls)


@pytest.mark.parametrize("foreign", ["identity", "mount"])
def test_foreign_container_refuses_compose_mutations(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
    foreign: str,
) -> None:
    calls: list[list[str]] = []
    inventory = [
        {
            "Config": {
                "Labels": {
                    "com.docker.compose.project": installation.project,
                    "com.docker.compose.service": "radarr",
                    "io.popcorntv.discovery.install": "foreign"
                    if foreign == "identity"
                    else installation.identity,
                }
            },
            "Mounts": [
                {
                    "Destination": "/config",
                    "Source": "/foreign/config"
                    if foreign == "mount"
                    else str(installation.root / "radarr"),
                }
            ],
            "NetworkSettings": {"Ports": {"7878/tcp": [{"HostPort": "17878"}]}},
        }
    ]

    def docker_boundary(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        calls.append(arguments)
        if arguments[:2] == ["docker", "ps"]:
            return "fixture-container"
        if arguments[:2] == ["docker", "inspect"]:
            return json.dumps(inventory)
        raise AssertionError("unexpected mutation")

    monkeypatch.setattr(discovery, "command", docker_boundary)
    for action in (["up", "-d"], ["stop"], ["down"]):
        with pytest.raises(discovery.DiscoveryError, match="foreign"):
            discovery.compose(installation, action)
    assert not any("compose" in call for call in calls)


def test_stop_cli_remains_available_after_credential_expiry(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import sys

    path = installation.root / "radarr-credentials.json"
    record = json.loads(path.read_text())
    record["expires_at"] = "2020-01-01T00:00:00+00:00"
    path.write_text(json.dumps(record))
    calls: list[list[str]] = []

    def docker_boundary(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        calls.append(arguments)
        return ""

    monkeypatch.setattr(discovery, "command", docker_boundary)
    monkeypatch.setattr(
        sys, "argv", ["local_discovery.py", "stop", "--state", str(installation.root)]
    )
    discovery.main()
    assert any("compose" in call and call[-1] == "stop" for call in calls)
    assert path.exists()
    assert json.loads(path.read_text()) == record


def test_owned_container_and_published_port_are_recognized(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inventory = [
        {
            "Config": {
                "Labels": {
                    "com.docker.compose.project": installation.project,
                    "com.docker.compose.service": "radarr",
                    "io.popcorntv.discovery.install": installation.identity,
                }
            },
            "Mounts": [
                {"Destination": "/config", "Source": str(installation.root / "radarr")}
            ],
            "NetworkSettings": {
                "Ports": {"7878/tcp": [{"HostIp": "127.0.0.1", "HostPort": "17878"}]}
            },
        }
    ]
    calls: list[list[str]] = []

    def docker_boundary(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        calls.append(arguments)
        if arguments[:2] == ["docker", "ps"]:
            return "owned-fixture"
        if arguments[:2] == ["docker", "inspect"]:
            return json.dumps(inventory)
        return ""

    monkeypatch.setattr(discovery, "command", docker_boundary)
    containers = discovery.owned_containers(installation)
    assert discovery.owned_host_ports(containers) == {17878}
    discovery.compose(installation, ["stop"])
    assert calls[-1][-1] == "stop"
    assert calls[-1][:2] == ["docker", "compose"]


def test_api_does_not_send_credentials_to_environment_proxy(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests: list[str] = []

    class ProxyCanary(BaseHTTPRequestHandler):
        def log_message(self, *_args: object) -> None:
            pass

        def do_GET(self) -> None:
            requests.append(self.path)
            self.send_response(502)
            self.end_headers()

    proxy = ThreadingHTTPServer(("127.0.0.1", 0), ProxyCanary)
    thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    thread.start()
    try:
        address = f"http://127.0.0.1:{proxy.server_port}"
        for name in ("HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
            monkeypatch.setenv(name, address)
        for name in ("NO_PROXY", "no_proxy"):
            monkeypatch.setenv(name, "")
        api = discovery.Api(installation, discovery.SERVICES[0])
        model = FakeArr(api.credential)
        with model.serve(api):
            discovery.configure(api)
        assert model.writes
        assert requests == []
    finally:
        proxy.shutdown()
        thread.join(timeout=2)
        proxy.server_close()


def test_network_inventory_accounts_for_docker_and_nondefault_host_routes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def inventory(arguments: list[str], *, env: dict[str, str] | None = None) -> str:
        if arguments == ["docker", "network", "ls", "-q"]:
            return "fixture-network"
        if arguments[:3] == ["docker", "network", "inspect"]:
            return json.dumps(
                [
                    {
                        "IPAM": {
                            "Config": [
                                {"Subnet": "10.203.206.0/29"},
                                {"Subnet": "fd00::/64"},
                                {},
                            ]
                        }
                    },
                    {"IPAM": {"Config": None}},
                ]
            )
        assert arguments == ["ip", "-j", "route"]
        return json.dumps(
            [{"dst": "default"}, {}, {"dst": "10.203.206.8/29"}, {"dst": "fd00::/64"}]
        )

    monkeypatch.setattr(discovery, "command", inventory)
    assert discovery.occupied_networks() == [
        ipaddress.IPv4Network("10.203.206.0/29"),
        ipaddress.IPv4Network("10.203.206.8/29"),
    ]
    assert discovery.choose_subnet(
        discovery.occupied_networks()
    ) == ipaddress.IPv4Network("10.203.206.16/29")


def test_root_operator_is_refused_before_any_state_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(os, "getuid", lambda: 0)
    with pytest.raises(discovery.DiscoveryError, match="non-root"):
        discovery.initialize(tmp_path / "state")
    assert not (tmp_path / "state").exists()


def test_administration_port_conflict_is_refused_and_owned_port_is_allowed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        service = discovery.Service("fixture", 1, "v1", port)
        monkeypatch.setattr(discovery, "SERVICES", (service,))
        with pytest.raises(discovery.DiscoveryError, match="unavailable"):
            discovery.check_ports()
        discovery.check_ports({port})
    discovery.check_ports()


@pytest.mark.parametrize("value", [[], None, 42, {1: "invalid key"}])
def test_decoded_json_must_be_a_string_keyed_object(value: object) -> None:
    with pytest.raises(discovery.DiscoveryError, match="invalid JSON object"):
        discovery.object_map(value)


@pytest.mark.parametrize(
    "images", ["", "radarr:latest", "lscr.io/linuxserver/radarr:tag@sha256:" + "a" * 64]
)
def test_missing_or_unpinned_image_inventory_refuses_start(
    installation: discovery.Installation,
    monkeypatch: pytest.MonkeyPatch,
    images: str,
) -> None:
    calls: list[list[str]] = []

    def inventory(arguments: list[str], *, env: dict[str, str] | None = None) -> str:
        calls.append(arguments)
        return images if "--images" in arguments else ""

    monkeypatch.setattr(discovery, "command", inventory)
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert not any("up" in arguments for arguments in calls)


def test_cli_status_checks_actual_http_config_without_writes(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    models, _calls = controller
    discovery.start(installation)
    writes = {name: list(model.writes) for name, model in models.items()}
    monkeypatch.setattr(
        sys, "argv", ["local_discovery.py", "status", "--state", str(installation.root)]
    )
    discovery.main()
    assert {name: model.writes for name, model in models.items()} == writes


@pytest.mark.parametrize(
    "record",
    [
        [],
        [{}],
        [{"Id": "radarr:latest", "Config": {"Labels": {}}}],
        [{"Id": "sha256:" + "b" * 64, "Config": {"Labels": {}}}],
    ],
)
def test_unverified_rebuild_provenance_never_starts(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
    record: object,
) -> None:
    _models, calls = controller
    original = discovery.command

    def altered_inventory(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        if arguments[:3] == ["docker", "image", "inspect"]:
            return json.dumps(record)
        return original(arguments, env=env)

    monkeypatch.setattr(discovery, "command", altered_inventory)
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert not any("up" in call for call in calls)


def test_every_start_uses_the_exact_image_identity_that_passed_scan(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _models, calls = controller
    original = discovery.command
    deployed: list[str] = []

    def record_identity(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        if arguments[:2] == ["docker", "compose"] and "up" in arguments:
            assert env is not None
            deployed.append(env["DISCOVERY_RADARR_IMAGE"])
        return original(arguments, env=env)

    monkeypatch.setattr(discovery, "command", record_identity)
    discovery.start(installation)
    identity = "sha256:" + "b" * 64
    assert deployed == [identity, identity]
    assert any("IMAGE=" + identity in call for call in calls)


def test_private_acceptance_does_not_reserve_operator_admin_ports(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _models, calls = controller

    def forbidden_port_check(_owned: set[int] | None = None) -> None:
        raise AssertionError("private acceptance must not reserve operator ports")

    monkeypatch.setattr(discovery, "check_ports", forbidden_port_check)
    discovery.start(installation, publish=False)
    assert not any(str(discovery.PUBLISH) in call for call in calls)


def test_ingress_configuration_is_private_idempotent_and_never_reset(
    installation: discovery.Installation,
) -> None:
    discovery.prepare_ingress(installation)
    subnet = discovery.load_ingress_subnet(installation)
    assert not subnet.overlaps(installation.subnet)
    path = installation.root / "ingress.Caddyfile"
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    original = path.read_text()
    discovery.prepare_ingress(installation)
    assert path.read_text() == original
    path.write_text("owner change")
    with pytest.raises(discovery.DiscoveryError, match="changed"):
        discovery.prepare_ingress(installation)
    assert path.read_text() == "owner change"


@pytest.mark.parametrize("change", ["identity", "schema", "overlap", "range", "prefix"])
def test_invalid_ingress_network_record_is_preserved(
    installation: discovery.Installation, change: str
) -> None:
    discovery.prepare_ingress(installation)
    path = installation.root / "ingress-network.json"
    record = json.loads(path.read_text())
    if change == "identity":
        record["identity"] = "foreign"
    elif change == "schema":
        record["schema"] = 2
    else:
        record["subnet"] = {
            "overlap": str(installation.subnet),
            "range": "192.168.1.0/29",
            "prefix": "10.203.206.0/28",
        }[change]
    path.write_text(json.dumps(record))
    before = path.read_bytes()
    with pytest.raises(discovery.DiscoveryError):
        discovery.prepare_ingress(installation)
    assert path.read_bytes() == before


@pytest.mark.parametrize(
    "fault",
    [
        "app-network",
        "network-owner",
        "network-isolation",
        "network-subnet",
        "service-address",
    ],
)
def test_network_boundary_drift_prevents_publication(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    _models, calls = controller
    original = discovery.command

    def drifted(arguments: list[str], *, env: dict[str, str] | None = None) -> str:
        value = original(arguments, env=env)
        if arguments[:3] == ["docker", "network", "inspect"]:
            data = json.loads(value)
            if fault == "network-owner":
                data[0]["Labels"]["com.docker.compose.project"] = "foreign"
            elif fault == "network-isolation":
                data[0]["Internal"] = False
            elif fault == "network-subnet":
                data[0]["IPAM"]["Config"][0]["Subnet"] = "192.168.1.0/29"
            return json.dumps(data)
        if arguments[:2] == ["docker", "inspect"]:
            data = json.loads(value)
            if fault == "app-network":
                data[0]["NetworkSettings"]["Networks"]["foreign"] = {}
            elif fault == "service-address":
                data[0]["NetworkSettings"]["Networks"][
                    installation.project + "_discovery"
                ]["IPAddress"] = "10.0.0.1"
            return json.dumps(data)
        return value

    monkeypatch.setattr(discovery, "command", drifted)
    with pytest.raises(discovery.DiscoveryError):
        discovery.start(installation)
    assert not any(str(discovery.PUBLISH) in call for call in calls)
    assert any("stop" in call for call in calls)


@pytest.mark.parametrize(
    "fault", ["missing", "wide-binding", "wrong-port", "duplicate"]
)
def test_unconfirmed_actual_publication_rolls_back(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
    monkeypatch: pytest.MonkeyPatch,
    fault: str,
) -> None:
    _models, calls = controller
    original = discovery.command

    def altered_bindings(
        arguments: list[str], *, env: dict[str, str] | None = None
    ) -> str:
        value = original(arguments, env=env)
        if arguments[:2] == ["docker", "inspect"]:
            data = json.loads(value)
            for row in data:
                ports = row["NetworkSettings"]["Ports"]
                if not ports:
                    continue
                bindings = ports["9696/tcp"]
                if fault == "missing":
                    ports["9696/tcp"] = None
                elif fault == "wide-binding":
                    bindings[0]["HostIp"] = "0.0.0.0"
                elif fault == "wrong-port":
                    bindings[0]["HostPort"] = "19999"
                else:
                    bindings.append(dict(bindings[0]))
            return json.dumps(data)
        return value

    monkeypatch.setattr(discovery, "command", altered_bindings)
    with pytest.raises(discovery.DiscoveryError, match="publication"):
        discovery.start(installation)
    assert any("--force-recreate" in call for call in calls)
    discovery.verify_withdrawal(installation)


def test_forms_policy_without_an_account_still_provisions_the_operator(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    model = FakeArr(api.credential)
    model.host = {**discovery.host_policy(), "username": ""}
    with model.serve(api):
        assert api.request("/initialize.json", authenticated=False).status == 401
        discovery.configure(api)
        assert model.host["username"] == api.credential.username
        assert len(model.writes) == 1
        discovery.verify_auth(api)


def test_unsafe_legacy_authentication_is_stopped_without_rewriting_state(
    installation: discovery.Installation,
    controller: tuple[dict[str, FakeArr], list[list[str]]],
) -> None:
    _models, calls = controller
    path = installation.root / "radarr/config.xml"
    path.write_text(
        path.read_text().replace(
            "<AuthenticationMethod>Forms</AuthenticationMethod>",
            "<AuthenticationMethod>None</AuthenticationMethod>",
        )
    )
    before = path.read_bytes()
    with pytest.raises(discovery.DiscoveryError, match="first-listen"):
        discovery.start(installation)
    assert not any("up" in call for call in calls)
    assert any("stop" in call for call in calls)
    assert path.read_bytes() == before


def test_bootstrap_never_replaces_a_foreign_administrator(
    installation: discovery.Installation,
) -> None:
    api = discovery.Api(installation, discovery.SERVICES[0])
    model = FakeArr(api.credential)
    model.host = {**discovery.host_policy(), "username": "owner-edited"}
    with (
        model.serve(api),
        pytest.raises(discovery.DiscoveryError, match="administrator changed"),
    ):
        discovery.configure(api)
    assert not model.writes
    assert model.host["username"] == "owner-edited"
