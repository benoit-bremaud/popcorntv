#!/usr/bin/env python3
"""Provision private, empty local discovery services without retrieving media.

Run through the pinned environment: ``mise x -- uv run --frozen --group ci python
scripts/local_discovery.py init|start|status|stop``. Credentials stay in private state.
"""

from __future__ import annotations

import argparse
import contextlib
import fcntl
import functools
import http.client
import ipaddress
import json
import logging
import os
import re
import secrets
import signal
import socket
import stat
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from email.message import Message
from http.cookies import CookieError, SimpleCookie
from pathlib import Path
from types import FrameType
from typing import NoReturn, cast

import defusedxml.ElementTree as SafeET
from defusedxml import DefusedXmlException

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ROOT / "deploy/local-discovery/compose.yml"
PUBLISH = ROOT / "deploy/local-discovery/publish.yml"
DEFAULT_STATE = ROOT / "data/local-discovery"
MAX_RESPONSE = 512 * 1024
LOGGER = logging.getLogger("popcorntv.discovery")
COMMAND_TIMEOUT = 180
RADARR_TAG = "popcorntv-radarr:af772b0-imagesharp3.2.0"
CADDY_IMAGE = "popcorntv-discovery-ingress:7ce9f08"
CADDY_REVISION = "7ce9f0823762109fc67911f95f6af1a697345ab7"
RADARR_REVISION = "af772b051ac27a0615c7f8b7f78622b6dc183be0"
DISCOVERY_POOL = ipaddress.IPv4Network("10.203.206.0/24")
SERVICE_LABEL = "com.docker.compose.service"
HOST_CONFIG_ENDPOINT = "config/host"
INDEXER_CONFIG_ENDPOINT = "config/indexer"
PUBLICATION_REFUSAL = "effective loopback publication not confirmed"


class DiscoveryError(RuntimeError):
    """A categorical provisioning failure safe to print without provider payloads."""


class CredentialsExpired(DiscoveryError):
    """Rotation is due: the running services must not keep serving on expired keys."""


class DiscoveryInterrupted(BaseException):
    """A catchable termination request that must complete fail-closed withdrawal."""


@contextlib.contextmanager
def termination_guard() -> Iterator[None]:
    """Translate SIGTERM to cleanup; SIGKILL/power loss require later reconciliation."""

    def terminate(_number: int, _frame: FrameType | None) -> NoReturn:
        raise DiscoveryInterrupted("termination requested")

    previous = signal.signal(signal.SIGTERM, terminate)
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, previous)


@dataclass(frozen=True)
class Service:
    """Fixed service identity; callers cannot supply arbitrary credential destinations."""

    name: str
    port: int
    api: str
    host_port: int


SERVICES = (
    Service("prowlarr", 9696, "v1", 19696),
    Service("radarr", 7878, "v3", 17878),
)


@dataclass(frozen=True)
class Credential:
    """Private values are intentionally excluded from diagnostic representations."""

    username: str
    password: str = field(repr=False)
    api_key: str = field(repr=False)
    expires_at: str


@dataclass(frozen=True)
class Installation:
    """Validated identity of the one state root and Compose project this run owns."""

    root: Path
    identity: str
    subnet: ipaddress.IPv4Network
    uid: int
    gid: int
    credentials: dict[str, Credential] = field(repr=False)
    published_ports: dict[str, int] = field(default_factory=dict)

    @property
    def project(self) -> str:
        """Scope Compose lifecycle operations to this installation identity."""
        return "popcorntv-discovery-" + self.identity

    def address(self, service: Service) -> str:
        """Return the fixed address within this installation's isolated network."""
        return str(self.subnet[2 if service.name == "prowlarr" else 3])

    def host_port(self, service: Service) -> int:
        """Use fixed operator ports or explicit ephemeral acceptance bindings."""
        port = self.published_ports.get(service.name, service.host_port)
        if not 0 <= port <= 65535:
            raise DiscoveryError("invalid loopback administration port")
        return port

    def environment(self) -> dict[str, str]:
        """Pass topology only to Compose; no credential enters container environment."""
        result = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("COMPOSE_", "DISCOVERY_"))
        }
        result.update(
            {
                "DISCOVERY_PROJECT": self.project,
                "DISCOVERY_INSTALL_ID": self.identity,
                "DISCOVERY_STATE_ROOT": str(self.root),
                "DISCOVERY_SUBNET": str(self.subnet),
                "DISCOVERY_UID": str(self.uid),
                "DISCOVERY_GID": str(self.gid),
                "DISCOVERY_RADARR_IMAGE": RADARR_TAG,
                "DISCOVERY_INGRESS_IP": str(self.subnet[6]),
                "DISCOVERY_INGRESS_IMAGE": CADDY_IMAGE,
            }
        )
        for service in SERVICES:
            result[f"DISCOVERY_{service.name.upper()}_IP"] = self.address(service)
            result[f"DISCOVERY_{service.name.upper()}_HOST_PORT"] = str(
                self.host_port(service)
            )
        return result


def object_map(value: object) -> dict[str, object]:
    """Narrow untrusted decoded JSON without accepting non-string mapping keys."""
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise DiscoveryError("invalid JSON object")
    return cast("dict[str, object]", value)


@functools.cache
def local_docker_endpoint() -> str:
    """Resolve once and pin the local daemon; never follow an ambient remote context."""
    endpoint = os.environ.get("DOCKER_HOST", "")
    if not endpoint or os.environ.get("DOCKER_CONTEXT"):
        try:
            result = subprocess.run(
                [
                    "docker",
                    "context",
                    "inspect",
                    "--format",
                    "{{.Endpoints.docker.Host}}",
                ],
                text=True,
                capture_output=True,
                timeout=10,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as error:
            raise DiscoveryError("cannot resolve the local Docker endpoint") from error
        if result.returncode:
            raise DiscoveryError("Docker context inspection failed")
        endpoint = result.stdout.strip()
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme != "unix" or parsed.netloc or parsed.query or parsed.fragment:
        raise DiscoveryError("remote Docker endpoint refused; local installation only")
    socket_path = Path(parsed.path)
    if socket_path.resolve() != Path("/var/run/docker.sock").resolve():
        raise DiscoveryError("Docker socket unsupported by the pinned image scanner")
    if not stat.S_ISSOCK(socket_path.stat().st_mode):
        raise DiscoveryError("local Docker socket unavailable")
    return "unix://" + str(socket_path)


def command(arguments: list[str], *, env: dict[str, str] | None = None) -> str:
    """Capture diagnostics at the boundary; never echo Docker/API payloads or keys."""
    environment = dict(os.environ if env is None else env)
    if arguments[0] in ("docker", "make"):
        for key in (
            "DOCKER_CONTEXT",
            "DOCKER_HOST",
            "DOCKER_TLS_VERIFY",
            "DOCKER_CERT_PATH",
        ):
            environment.pop(key, None)
        environment["DOCKER_HOST"] = local_docker_endpoint()
    try:
        with subprocess.Popen(
            arguments,
            env=environment,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,
        ) as process:
            try:
                stdout, _stderr = process.communicate(timeout=COMMAND_TIMEOUT)
            except BaseException:
                # Fence the Compose plugin as well as its parent CLI before any rollback.
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(process.pid, signal.SIGKILL)
                    process.communicate(timeout=5)
                raise
            return_code = process.returncode
    except (OSError, subprocess.TimeoutExpired) as error:
        raise DiscoveryError(f"{arguments[0]} unavailable or timed out") from error
    if return_code:
        raise DiscoveryError(f"{arguments[0]} operation failed (exit {return_code})")
    return stdout


def private_path(path: Path, *, directory: bool) -> None:
    """Reject links, foreign ownership and group/world-readable private state."""
    info = path.lstat()
    expected = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not expected or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise DiscoveryError("state path must be private, owned and not a symlink")


def write_private(path: Path, value: str) -> None:
    """Create only new private files; never follow or overwrite an existing target."""
    descriptor = os.open(
        path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(descriptor, "w") as stream:
        stream.write(value)


def load_identity(root: Path) -> Installation:
    """Load ownership without API secrets so emergency stop survives credential expiry."""
    root = root.absolute()
    for component in (root, *root.parents):
        if component.is_symlink():
            raise DiscoveryError("symlink state path refused")
    private_path(root, directory=True)
    manifest = root / "installation.json"
    private_path(manifest, directory=False)
    data = object_map(json.loads(manifest.read_text()))
    identity = data.get("identity")
    if (
        data.get("schema") != 1
        or not isinstance(identity, str)
        or not re.fullmatch(r"[a-f0-9]{16}", identity)
    ):
        raise DiscoveryError("unknown installation identity")
    if data.get("uid") != os.getuid() or data.get("gid") != os.getgid():
        raise DiscoveryError("installation operator changed")
    subnet = ipaddress.ip_network(str(data.get("subnet")))
    if (
        not isinstance(subnet, ipaddress.IPv4Network)
        or subnet.prefixlen != 29
        or not subnet.subnet_of(DISCOVERY_POOL)
    ):
        raise DiscoveryError("invalid installation subnet")
    for service in SERVICES:
        private_path(root / service.name, directory=True)
    return Installation(root, identity, subnet, os.getuid(), os.getgid(), {})


def load_credential(path: Path) -> Credential:
    """Validate one private credential record, including its timezone and rotation date."""
    private_path(path, directory=False)
    secret = object_map(json.loads(path.read_text()))
    username, password, key, expires = (
        secret.get(name) for name in ("username", "password", "api_key", "expires_at")
    )
    if (
        not isinstance(username, str)
        or username != "popcorntv-operator"
        or not isinstance(password, str)
        or len(password) < 32
        or not isinstance(key, str)
        or not re.fullmatch(r"[a-f0-9]{32}", key)
        or not isinstance(expires, str)
    ):
        raise DiscoveryError("invalid private credential record")
    expiry = datetime.fromisoformat(expires)
    if expiry.tzinfo is None:
        raise DiscoveryError("credential expiry must include a timezone")
    if expiry <= datetime.now(UTC):
        raise CredentialsExpired(
            "credential rotation due; automatic replacement refused"
        )
    return Credential(username, password, key, expires)


def load_installation(root: Path) -> Installation:
    """Require valid private API credentials for setup, start and status operations."""
    installation = load_identity(root)
    credentials = {
        service.name: load_credential(
            installation.root / (service.name + "-credentials.json")
        )
        for service in SERVICES
    }
    return replace(installation, credentials=credentials)


def occupied_docker_networks() -> list[ipaddress.IPv4Network]:
    """Read allocated Docker IPv4 blocks, including networks with no IPAM config."""
    found: list[ipaddress.IPv4Network] = []
    identifiers = command(["docker", "network", "ls", "-q"]).split()
    if not identifiers:
        return found
    rows = json.loads(command(["docker", "network", "inspect", *identifiers]))
    for row in rows:
        for config in row.get("IPAM", {}).get("Config", []) or []:
            if config.get("Subnet"):
                network = ipaddress.ip_network(config["Subnet"])
                if isinstance(network, ipaddress.IPv4Network):
                    found.append(network)
    return found


def occupied_networks() -> list[ipaddress.IPv4Network]:
    """Combine Docker IPAM and real host routes, excluding the default route."""
    found = occupied_docker_networks()
    for route in json.loads(command(["ip", "-j", "route"])):
        if route.get("dst") not in (None, "default"):
            network = ipaddress.ip_network(route["dst"], strict=False)
            if isinstance(network, ipaddress.IPv4Network) and network.prefixlen:
                found.append(network)
    return found


def choose_subnet(occupied: list[ipaddress.IPv4Network]) -> ipaddress.IPv4Network:
    """Choose a bounded free private block; no random collision-prone network guessing."""
    for candidate in DISCOVERY_POOL.subnets(new_prefix=29):
        if not any(candidate.overlaps(other) for other in occupied):
            return candidate
    raise DiscoveryError("no collision-free local discovery subnet")


def initialize(root: Path) -> Installation:
    """Initialize a new root only; existing or incomplete state is never reset."""
    if os.getuid() == 0:
        raise DiscoveryError("a non-root local operator is required")
    root = root.absolute()
    for component in (root, *root.parents):
        if component.is_symlink():
            raise DiscoveryError("symlink state path refused")
    if root.exists():
        return load_installation(root)
    subnet = choose_subnet(occupied_networks())
    root.parent.mkdir(parents=True, exist_ok=True)
    root.mkdir(mode=0o700)
    expires = (datetime.now(UTC) + timedelta(days=90)).isoformat()
    for service in SERVICES:
        folder = root / service.name
        folder.mkdir(mode=0o700)
        key, password = secrets.token_hex(16), secrets.token_urlsafe(36)
        write_private(
            root / (service.name + "-credentials.json"),
            json.dumps(
                {
                    "name": f"local-discovery-{service.name}-operator",
                    "username": "popcorntv-operator",
                    "password": password,
                    "api_key": key,
                    "expires_at": expires,
                }
            )
            + "\n",
        )
        config = ET.Element("Config")
        for name, value in {
            "BindAddress": "*",
            "Port": str(service.port),
            "ApiKey": key,
            "AuthenticationMethod": "Forms",
            "AuthenticationRequired": "Enabled",
            "LogLevel": "info",
            "LogSizeLimit": "1",
            "AnalyticsEnabled": "False",
            "UpdateAutomatically": "False",
            "LaunchBrowser": "False",
        }.items():
            ET.SubElement(config, name).text = value
        write_private(folder / "config.xml", ET.tostring(config, encoding="unicode"))
    write_private(
        root / "installation.json",
        json.dumps(
            {
                "schema": 1,
                "identity": secrets.token_hex(8),
                "subnet": str(subnet),
                "uid": os.getuid(),
                "gid": os.getgid(),
            }
        )
        + "\n",
    )
    LOGGER.info("initialized private discovery state; no services started")
    return load_installation(root)


@contextlib.contextmanager
def installation_lock(installation: Installation) -> Iterator[None]:
    """Serialize one install's controller operations, retaining a stable lock inode."""
    descriptor = os.open(
        installation.root / ".lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600
    )
    with os.fdopen(descriptor, "a") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise DiscoveryError("another discovery operation is running") from error
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Never forward service credentials to a redirect destination."""

    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: object,
        code: int,
        msg: str,
        headers: object,
        newurl: str,
    ) -> None:
        """Keep credential-bearing requests from following service-provided redirects."""


@dataclass(frozen=True)
class ApiResponse:
    """Bounded response; payload is never included in diagnostic representations."""

    status: int
    body: bytes = field(repr=False, default=b"")
    cookie: str = field(repr=False, default="")


def session_cookies(headers: Message) -> str:
    """Convert every Set-Cookie field into a request cookie without logging values."""
    cookies = SimpleCookie()
    try:
        for header in headers.get_all("Set-Cookie", []):
            cookies.load(header)
    except CookieError as error:
        raise DiscoveryError("invalid administrative session cookie") from error
    return "; ".join(f"{name}={item.coded_value}" for name, item in cookies.items())


class Api:
    """Fixed private service destination with proxy/redirect credential containment."""

    def __init__(
        self,
        installation: Installation,
        service: Service,
        *,
        published: bool = False,
        port: int | None = None,
    ) -> None:
        """Keep credentials confined to one validated service or loopback endpoint."""
        self.service = service
        self.credential = installation.credentials[service.name]
        if published:
            selected_port = installation.host_port(service) if port is None else port
            self.base = f"http://127.0.0.1:{selected_port}"
        else:
            self.base = f"http://{installation.address(service)}:{service.port}"
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        payload: object = None,
        authenticated: bool = True,
        wrong_key: bool = False,
        form: dict[str, str] | None = None,
        cookie: str = "",
    ) -> ApiResponse:
        """Perform one bounded request, with no automatic write retry or redirects."""
        if (
            not path.startswith("/")
            or path.startswith("//")
            or any(c in path for c in "\r\n?#")
        ):
            raise DiscoveryError("invalid fixed API path")
        headers = {"Accept": "application/json"}
        if authenticated:
            headers["X-Api-Key"] = (
                "invalid-fixture-key" if wrong_key else self.credential.api_key
            )
        if cookie:
            headers["Cookie"] = cookie
        body: bytes | None = None
        if form is not None:
            body = urllib.parse.urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif payload is not None:
            body = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self.base + path, data=body, headers=headers, method=method
        )
        try:
            with self.opener.open(request, timeout=5) as response:
                content = response.read(MAX_RESPONSE + 1)
                if len(content) > MAX_RESPONSE:
                    raise DiscoveryError("service response exceeds size budget")
                return ApiResponse(
                    response.status, content, session_cookies(response.headers)
                )
        except urllib.error.HTTPError as error:
            cookie_header = session_cookies(error.headers)
            error.close()
            return ApiResponse(error.code, cookie=cookie_header)
        except (
            OSError,
            http.client.HTTPException,
        ) as error:
            raise DiscoveryError(
                f"{self.service.name} API unavailable; outcome may be uncertain"
            ) from error

    def json(self, endpoint: str, *, payload: object = None) -> object:
        """Read JSON or submit one configuration PUT; never echo a response body."""
        result = self.request(
            f"/api/{self.service.api}/{endpoint}",
            method="GET" if payload is None else "PUT",
            payload=payload,
        )
        if result.status != 200:
            raise DiscoveryError(
                f"{self.service.name} API refused configuration (HTTP {result.status})"
            )
        try:
            value: object = json.loads(result.body)
            return value
        except ValueError as error:
            raise DiscoveryError("service returned invalid JSON") from error


def compose(
    installation: Installation,
    arguments: list[str],
    *,
    published: bool = False,
    radarr_image: str | None = None,
    ingress_image: str | None = None,
) -> str:
    """Run only this install's explicit Compose files and environment."""
    if arguments and arguments[0] in ("up", "stop", "down"):
        owned_containers(installation)
    prefix = [
        "docker",
        "compose",
        "--env-file",
        "/dev/null",
        "--project-name",
        installation.project,
        "-f",
        str(COMPOSE),
    ]
    if published or (arguments and arguments[0] == "down"):
        prefix += ["-f", str(PUBLISH)]
    environment = installation.environment()
    if published or (arguments and arguments[0] == "down"):
        environment["DISCOVERY_INGRESS_SUBNET"] = str(load_ingress_subnet(installation))
    if ingress_image is not None:
        environment["DISCOVERY_INGRESS_IMAGE"] = ingress_image
    if radarr_image is not None:
        environment["DISCOVERY_RADARR_IMAGE"] = radarr_image
    return command([*prefix, *arguments], env=environment)


def owned_containers(installation: Installation) -> list[dict[str, object]]:
    """Refuse foreign project collisions before any Compose mutation or stop."""
    identifiers = command(
        [
            "docker",
            "ps",
            "--all",
            "--quiet",
            "--filter",
            "label=com.docker.compose.project=" + installation.project,
        ]
    ).split()
    if not identifiers:
        return []
    decoded: object = json.loads(command(["docker", "inspect", *identifiers]))
    if not isinstance(decoded, list):
        raise DiscoveryError("invalid container ownership inventory")
    result: list[dict[str, object]] = []
    for value in decoded:
        row = object_map(value)
        labels = object_map(object_map(row.get("Config")).get("Labels"))
        name = labels.get(SERVICE_LABEL)
        if (
            labels.get("com.docker.compose.project") != installation.project
            or labels.get("io.popcorntv.discovery.install") != installation.identity
            or name not in {service.name for service in SERVICES} | {"ingress"}
        ):
            raise DiscoveryError(
                "foreign container in discovery project; mutation refused"
            )
        mounts = row.get("Mounts")
        if not isinstance(mounts, list):
            raise DiscoveryError("container config ownership unconfirmed")
        destination = "/etc/caddy/Caddyfile" if name == "ingress" else "/config"
        source = installation.root / (
            "ingress.Caddyfile" if name == "ingress" else str(name)
        )
        configs = [
            object_map(mount)
            for mount in mounts
            if object_map(mount).get("Destination") == destination
        ]
        if len(configs) != 1 or configs[0].get("Source") != str(source):
            raise DiscoveryError("foreign configuration mount; mutation refused")
        result.append(row)
    return result


def inspected_host_ports(bindings: dict[str, object]) -> set[int]:
    """Extract numeric host ports from a single inspected container's bindings."""
    ports: set[int] = set()
    for rows in bindings.values():
        if not isinstance(rows, list):
            continue
        for row in rows:
            value = object_map(row).get("HostPort")
            if isinstance(value, str) and value.isdecimal():
                ports.add(int(value))
    return ports


def owned_host_ports(containers: list[dict[str, object]]) -> set[int]:
    """Only proven owned bindings may explain a busy port during a start rerun."""
    ports: set[int] = set()
    for container in containers:
        bindings = object_map(container.get("NetworkSettings")).get("Ports")
        if isinstance(bindings, dict):
            ports.update(inspected_host_ports(bindings))
    return ports


def verify_empty(api: Api) -> None:
    """Reject owner edits instead of silently deleting indexers, movies or clients."""
    endpoints = ["indexer", "downloadclient"]
    endpoints += (
        ["applications"]
        if api.service.name == "prowlarr"
        else ["movie", "importlist", "rootfolder"]
    )
    for endpoint in endpoints:
        value = api.json(endpoint)
        if value != []:
            raise DiscoveryError(
                f"{api.service.name} is not empty; owner state preserved"
            )


def verify_auth(api: Api) -> None:
    """Prove protected reads reject anonymous/wrong-key access and login really works."""
    path = f"/api/{api.service.api}/config/host"
    for result in (
        api.request(path, authenticated=False),
        api.request(path, wrong_key=True),
    ):
        if result.status not in (401, 403):
            raise DiscoveryError(
                f"{api.service.name} protected API authentication not enforced"
            )
    login = api.request(
        "/login",
        method="POST",
        authenticated=False,
        form={
            "username": api.credential.username,
            "password": api.credential.password,
            "rememberMe": "false",
        },
    )
    if login.status not in (200, 302) or not login.cookie:
        raise DiscoveryError(f"{api.service.name} administrative login not verified")
    # Vendor API policy requires an API key; forms cookies authorize the UI instead.
    if api.request("/", authenticated=False).status not in (302, 401, 403):
        raise DiscoveryError(
            f"{api.service.name} administrative UI authentication not enforced"
        )
    if api.request("/", authenticated=False, cookie=login.cookie).status != 200:
        raise DiscoveryError(f"{api.service.name} login session not authorized")


def host_policy() -> dict[str, object]:
    """Settings this installation owns; other vendor defaults are not overwritten."""
    return {
        "authenticationMethod": "forms",
        "authenticationRequired": "enabled",
        "analyticsEnabled": False,
        "updateAutomatically": False,
        "logLevel": "info",
        "logSizeLimit": 1,
    }


def verify_configuration(api: Api) -> None:
    """Validate a completed install without changing owner-edited state."""
    verify_empty(api)
    host = object_map(api.json(HOST_CONFIG_ENDPOINT))
    if any(host.get(key) != value for key, value in host_policy().items()):
        raise DiscoveryError(
            f"{api.service.name} managed settings changed; state preserved"
        )
    if api.service.name == "radarr":
        interval = object_map(api.json(INDEXER_CONFIG_ENDPOINT)).get("rssSyncInterval")
        if type(interval) is not int or interval != 0:
            raise DiscoveryError("Radarr RSS settings changed; state preserved")
    verify_auth(api)


def configure_host(api: Api) -> None:
    """Preserve foreign administrators and confirm host writes with a fresh read."""
    host = object_map(api.json(HOST_CONFIG_ENDPOINT))
    desired = host_policy()
    username = host.get("username")
    if username not in (None, "", api.credential.username):
        raise DiscoveryError(
            f"{api.service.name} existing administrator changed; state preserved"
        )
    if username != api.credential.username or any(
        host.get(key) != value for key, value in desired.items()
    ):
        host.update(desired)
        host.update(
            {
                "username": api.credential.username,
                "password": api.credential.password,
                "passwordConfirmation": api.credential.password,
            }
        )
        try:
            api.json(HOST_CONFIG_ENDPOINT, payload=host)
        except DiscoveryError:
            LOGGER.warning(
                "%s configuration response uncertain; checking fresh state",
                api.service.name,
            )
        current = object_map(api.json(HOST_CONFIG_ENDPOINT))
        if any(current.get(key) != value for key, value in desired.items()):
            raise DiscoveryError(f"{api.service.name} host configuration not confirmed")


def disable_radarr_rss(api: Api) -> None:
    """Disable Radarr polling, including confirmation after an uncertain accepted PUT."""
    indexers = object_map(api.json(INDEXER_CONFIG_ENDPOINT))
    if indexers.get("rssSyncInterval") != 0:
        indexers["rssSyncInterval"] = 0
        try:
            api.json(INDEXER_CONFIG_ENDPOINT, payload=indexers)
        except DiscoveryError:
            LOGGER.warning("Radarr RSS update uncertain; checking fresh state")
        if object_map(api.json(INDEXER_CONFIG_ENDPOINT)).get("rssSyncInterval") != 0:
            raise DiscoveryError("Radarr RSS disablement not confirmed")


def configure(api: Api) -> None:
    """Reconcile desired config by fresh reads, including uncertain accepted PUTs."""
    verify_empty(api)
    configure_host(api)
    if api.service.name == "radarr":
        disable_radarr_rss(api)
    verify_configuration(api)
    LOGGER.info(
        "%s authentication and empty-state configuration verified", api.service.name
    )


def check_ports(
    owned: set[int] | None = None, *, ports: tuple[int, ...] | None = None
) -> None:
    """Fail before bootstrap when either requested host administration port is occupied."""
    for port in (
        ports if ports is not None else tuple(service.host_port for service in SERVICES)
    ):
        if port == 0 or (owned and port in owned):
            continue
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError as error:
                raise DiscoveryError(
                    f"administration port {port} unavailable"
                ) from error


def rebuilt_image_identity(image: str, name: str, revision: str) -> str:
    """Require one immutable image with the expected source and compatibility labels."""
    decoded: object = json.loads(command(["docker", "image", "inspect", image]))
    if not isinstance(decoded, list) or len(decoded) != 1:
        raise DiscoveryError(f"rebuilt {name} image inventory invalid")
    row = object_map(decoded[0])
    labels = object_map(object_map(row.get("Config")).get("Labels"))
    identity = row.get("Id")
    if (
        not isinstance(identity, str)
        or not re.fullmatch(r"sha256:[a-f0-9]{64}", identity)
        or labels.get("org.opencontainers.image.revision") != revision
        or (
            name == "Radarr" and labels.get("io.popcorntv.radarr.imagesharp") != "3.2.0"
        )
    ):
        raise DiscoveryError(f"rebuilt {name} provenance not verified")
    return identity


def scan_discovery_image(image: str, name: str, digest: str) -> None:
    """Scan the exact immutable identity and retain its categorical failure report."""
    report = f"discovery-{name}-{digest[:12]}.json"
    try:
        command(
            [
                "make",
                "-C",
                str(ROOT),
                "scan-docker-image",
                "IMAGE=" + image,
                "TRIVY_FORMAT=json",
                "TRIVY_OUTPUT=" + report,
                "TRIVY_EXIT=1",
            ]
        )
    except DiscoveryError:
        LOGGER.error(
            "%s image scan failed; startup refused; report=.trivy/%s", name, report
        )
        raise


def verify_images(installation: Installation) -> tuple[str, str]:
    """Scan the immutable local Radarr identity and pinned upstream Prowlarr before up."""
    images = compose(installation, ["config", "--images"]).splitlines()
    names: set[str] = set()
    radarr_id = ""
    ingress_id = ""
    for image in images:
        if image == RADARR_TAG and "radarr" not in names:
            radarr_id = rebuilt_image_identity(image, "Radarr", RADARR_REVISION)
            name, digest, image = "radarr", radarr_id[7:], radarr_id
        elif image == CADDY_IMAGE and "ingress" not in names:
            ingress_id = rebuilt_image_identity(image, "ingress", CADDY_REVISION)
            name, digest, image = "ingress", ingress_id[7:], ingress_id
        else:
            match = re.fullmatch(
                r"lscr\.io/linuxserver/(prowlarr):[\w.-]+@sha256:([a-f0-9]{64})",
                image,
            )
            if match is None or match[1] in names:
                raise DiscoveryError("unexpected or unpinned discovery image")
            name, digest = match[1], match[2]
        names.add(name)
        scan_discovery_image(image, name, digest)
    if names != {service.name for service in SERVICES} | {"ingress"} or not radarr_id:
        raise DiscoveryError("required discovery image missing")
    if not ingress_id:
        raise DiscoveryError("required ingress image missing")
    return radarr_id, ingress_id


def verify_initialization_denial(installation: Installation) -> None:
    """The unauthenticated UI bootstrap route must never expose an enduring API key."""
    for service in SERVICES:
        if Api(installation, service).request(
            "/initialize.json", authenticated=False
        ).status not in (302, 401, 403):
            raise DiscoveryError(
                f"{service.name} initialization metadata is not protected"
            )


def stop_owned(installation: Installation, unconfirmed: str) -> None:
    """Best-effort stop of the owned services; never replaces the primary error."""
    stopped = False
    with contextlib.suppress(BaseException):
        compose(installation, ["stop"])
        stopped = True
    if not stopped:
        LOGGER.error(unconfirmed)


def require_first_listen_auth(installation: Installation) -> None:
    """Validate first-listen authentication; start owns cleanup after any refusal."""
    for service in SERVICES:
        path = installation.root / service.name / "config.xml"
        private_path(path, directory=False)
        try:
            config = SafeET.fromstring(path.read_bytes())
        except (ET.ParseError, DefusedXmlException) as error:
            raise DiscoveryError(
                "invalid private authentication XML; state preserved"
            ) from error
        if (
            config.findtext("AuthenticationMethod", "").lower() != "forms"
            or config.findtext("AuthenticationRequired", "").lower() != "enabled"
        ):
            raise DiscoveryError(
                "first-listen authentication required; legacy state preserved"
            )


def prepare_ingress(installation: Installation) -> None:
    """Add the approved proxy configuration without overwriting owner changes."""
    source = ROOT / "deploy/local-discovery/Caddyfile"
    destination = installation.root / "ingress.Caddyfile"
    expected = source.read_text()
    if destination.exists() or destination.is_symlink():
        private_path(destination, directory=False)
        if destination.read_text() != expected:
            raise DiscoveryError("ingress configuration changed; state preserved")
    else:
        write_private(destination, expected)
    network = installation.root / "ingress-network.json"
    if network.exists() or network.is_symlink():
        load_ingress_subnet(installation)
    else:
        subnet = choose_subnet([*occupied_networks(), installation.subnet])
        write_private(
            network,
            json.dumps(
                {"schema": 1, "identity": installation.identity, "subnet": str(subnet)}
            )
            + "\n",
        )


def load_ingress_subnet(installation: Installation) -> ipaddress.IPv4Network:
    """Require the persisted, separately allocated ingress subnet and installation identity."""
    path = installation.root / "ingress-network.json"
    private_path(path, directory=False)
    row = object_map(json.loads(path.read_text()))
    subnet = ipaddress.ip_network(str(row.get("subnet")))
    if (
        row.get("schema") != 1
        or row.get("identity") != installation.identity
        or not isinstance(subnet, ipaddress.IPv4Network)
        or subnet.prefixlen != 29
        or not subnet.subnet_of(DISCOVERY_POOL)
        or subnet.overlaps(installation.subnet)
    ):
        raise DiscoveryError("invalid owned ingress network record")
    return subnet


def verify_network(
    installation: Installation, role: str, subnet: ipaddress.IPv4Network
) -> None:
    """Prove a network's ownership, isolation mode, IPv4-only policy and allocation."""
    name = installation.project + "_" + role
    decoded: object = json.loads(command(["docker", "network", "inspect", name]))
    if not isinstance(decoded, list) or len(decoded) != 1:
        raise DiscoveryError("owned network inventory invalid")
    row = object_map(decoded[0])
    labels = object_map(row.get("Labels"))
    if (
        labels.get("com.docker.compose.project") != installation.project
        or labels.get("com.docker.compose.network") != role
        or row.get("Internal") is not (role == "discovery")
        or row.get("EnableIPv6") is not False
    ):
        raise DiscoveryError("network ownership or isolation not verified")
    configs = object_map(row.get("IPAM")).get("Config")
    if (
        not isinstance(configs, list)
        or len(configs) != 1
        or object_map(configs[0]).get("Subnet") != str(subnet)
    ):
        raise DiscoveryError("effective network subnet changed")


def verify_network_membership(installation: Installation, *, published: bool) -> None:
    """Inspect actual network ownership, isolation and exact service attachments."""
    discovery_name = installation.project + "_discovery"
    ingress_name = installation.project + "_ingress"
    # Read the persisted ingress allocation before inspecting either effective network.
    ingress_subnet = load_ingress_subnet(installation) if published else None
    verify_network(installation, "discovery", installation.subnet)
    if ingress_subnet is not None:
        verify_network(installation, "ingress", ingress_subnet)
    for row in owned_containers(installation):
        service_name = object_map(object_map(row["Config"])["Labels"])[SERVICE_LABEL]
        networks = object_map(object_map(row["NetworkSettings"])["Networks"])
        allowed = (
            {discovery_name, ingress_name}
            if service_name == "ingress" and published
            else {discovery_name}
        )
        if set(networks) != allowed:
            raise DiscoveryError("unexpected service network attachment")
        expected_ip = (
            str(installation.subnet[6])
            if service_name == "ingress"
            else installation.address(
                next(service for service in SERVICES if service.name == service_name)
            )
        )
        if object_map(networks[discovery_name]).get("IPAddress") != expected_ip:
            raise DiscoveryError("effective private service address changed")


def loopback_port(installation: Installation, service: Service, values: object) -> int:
    """Accept only one effective loopback binding matching the requested service port."""
    if not isinstance(values, list) or len(values) != 1:
        raise DiscoveryError(PUBLICATION_REFUSAL)
    binding = object_map(values[0])
    value = binding.get("HostPort")
    if (
        binding.get("HostIp") != "127.0.0.1"
        or not isinstance(value, str)
        or not value.isdecimal()
        or not 1 <= int(value) <= 65535
        or installation.host_port(service) not in (0, int(value))
    ):
        raise DiscoveryError(PUBLICATION_REFUSAL)
    return int(value)


def verify_publication(installation: Installation) -> None:
    """Require effective proxy loopback bindings and actual authenticated reachability."""
    verify_network_membership(installation, published=True)
    rows = owned_containers(installation)
    ingress = [
        row
        for row in rows
        if object_map(object_map(row["Config"])["Labels"]).get(SERVICE_LABEL)
        == "ingress"
    ]
    if len(ingress) != 1:
        raise DiscoveryError("ingress ownership not confirmed")
    bindings = object_map(object_map(ingress[0]["NetworkSettings"])["Ports"])
    actual = {key: value for key, value in bindings.items() if value is not None}
    if set(actual) != {f"{service.port}/tcp" for service in SERVICES}:
        raise DiscoveryError(PUBLICATION_REFUSAL)
    selected: dict[str, int] = {}
    for service in SERVICES:
        selected[service.name] = loopback_port(
            installation, service, actual[f"{service.port}/tcp"]
        )
    for row in rows:
        if row is not ingress[0]:
            ports = object_map(object_map(row["NetworkSettings"])["Ports"])
            if any(ports.values()):
                raise DiscoveryError("application publication bypasses ingress")
    for service in SERVICES:
        verify_configuration(
            Api(installation, service, published=True, port=selected[service.name])
        )
    LOGGER.info("effective loopback bindings and authenticated proxy paths verified")


def verify_withdrawal(installation: Installation) -> None:
    """Confirm actual private topology and absent port bindings after rollback."""
    verify_network_membership(installation, published=False)
    verify_initialization_denial(installation)
    for row in owned_containers(installation):
        ports = object_map(object_map(row["NetworkSettings"])["Ports"])
        if any(ports.values()):
            raise DiscoveryError("effective publication withdrawal not confirmed")


def bootstrap_completed(installation: Installation) -> bool:
    """Distinguish resumable private bootstrap from read-only completed validation."""
    path = installation.root / "bootstrap-complete.json"
    if path.is_symlink():
        raise DiscoveryError("bootstrap marker symlink refused")
    if not path.exists():
        return False
    private_path(path, directory=False)
    record = object_map(json.loads(path.read_text()))
    if record != {"schema": 1, "identity": installation.identity}:
        raise DiscoveryError("unexpected bootstrap marker")
    return True


def start(installation: Installation, *, publish: bool = True) -> None:
    """Authenticate privately before publication; keep state and withdraw ports on failure."""
    with installation_lock(installation):
        try:
            require_first_listen_auth(installation)
            prepare_ingress(installation)
            radarr_image, ingress_image = verify_images(installation)
            if publish:
                check_ports(
                    owned_host_ports(owned_containers(installation)),
                    ports=tuple(
                        installation.host_port(service) for service in SERVICES
                    ),
                )
        except BaseException:
            # A rerun may already be published: every preflight refusal must stop it.
            LOGGER.error("startup preflight failed; stopping owned services")
            stop_owned(
                installation,
                "startup preflight failed; owned-service stop unconfirmed",
            )
            raise
        try:
            compose(
                installation,
                ["up", "-d", "--wait", "--wait-timeout", "120"],
                radarr_image=radarr_image,
                ingress_image=ingress_image,
            )
            verify_network_membership(installation, published=False)
            verify_initialization_denial(installation)
            completed = bootstrap_completed(installation)
            for service in SERVICES:
                api = Api(installation, service)
                if completed:
                    verify_configuration(api)
                else:
                    configure(api)
            if not completed:
                write_private(
                    installation.root / "bootstrap-complete.json",
                    json.dumps(
                        {
                            "schema": 1,
                            "identity": installation.identity,
                        }
                    )
                    + "\n",
                )
            if publish:
                compose(
                    installation,
                    ["up", "-d", "--wait", "--wait-timeout", "120"],
                    published=True,
                    radarr_image=radarr_image,
                    ingress_image=ingress_image,
                )
                verify_publication(installation)
            LOGGER.info(
                "local discovery ready; published=%s; no sources configured", publish
            )
        except BaseException:
            LOGGER.error(
                "bootstrap failed; withdrawing host ports and retaining private state"
            )
            rolled_back = False
            # Cleanup failures are recorded categorically and never replace the primary error.
            with contextlib.suppress(BaseException):
                compose(
                    installation,
                    ["up", "-d", "--force-recreate", "--wait", "--wait-timeout", "120"],
                    radarr_image=radarr_image,
                    ingress_image=ingress_image,
                )
                verify_withdrawal(installation)
                rolled_back = True
            if not rolled_back:
                # A failed rollback must not leave a partially published installation running.
                LOGGER.error(
                    "private rollback unconfirmed; attempting owned-service stop"
                )
                stop_owned(
                    installation,
                    "stop unconfirmed; retained state requires operator reconciliation",
                )
            raise


def main() -> None:
    """CLI entry point; never print credential values or load application .env files."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("init", "start", "status", "stop"))
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    arguments = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO, format="discovery: %(levelname)s %(message)s"
    )
    if arguments.action == "init":
        installation = initialize(arguments.state)
    elif arguments.action == "stop":
        installation = load_identity(arguments.state)
    else:
        try:
            installation = load_installation(arguments.state)
        except CredentialsExpired:
            expired = load_identity(arguments.state)
            with installation_lock(expired):
                LOGGER.error("credentials expired; stopping owned services")
                stop_owned(expired, "credentials expired; stop unconfirmed")
            raise
    if arguments.action == "start":
        start(installation)
    elif arguments.action == "stop":
        with installation_lock(installation):
            compose(installation, ["stop"])
            LOGGER.info("discovery stopped; private state retained")
    elif arguments.action == "status":
        try:
            for service in SERVICES:
                api = Api(installation, service)
                verify_configuration(api)
                LOGGER.info("%s API reachable, authenticated and empty", service.name)
        except DiscoveryError:
            # A failed proof must not leave the administration ports published.
            with installation_lock(installation):
                LOGGER.error("status proof failed; stopping owned services")
                stop_owned(installation, "status proof failed; stop unconfirmed")
            raise


if __name__ == "__main__":
    try:
        with termination_guard():
            main()
    except DiscoveryInterrupted:
        LOGGER.error("operation terminated; private state retained for reconciliation")
        raise SystemExit(143) from None
    except KeyboardInterrupt:
        LOGGER.error("operation interrupted; private state retained for reconciliation")
        raise SystemExit(130) from None
    except (DiscoveryError, OSError, ValueError) as error:
        LOGGER.error(
            "operation refused: %s",
            error if isinstance(error, DiscoveryError) else type(error).__name__,
        )
        raise SystemExit(1) from None
