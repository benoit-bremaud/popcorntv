#!/usr/bin/env python3
"""Manage the owned empty local retrieval installation behind the VPN gateway."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import ipaddress
import json
import logging
import os
import platform
import re
import secrets
import stat
import subprocess
import sys
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from retrieval_config import (
    FREE_RESERVE,
    FULL_IPV4,
    Refusal,
    Storage,
    client_settings,
    new_password,
    prepare_wireguard,
    private_file,
    reject_media_root,
    select_subnet,
    storage_from_mount,
    wireguard_networks,
    wireguard_text,
    write_private,
)

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ROOT / "deploy/local-retrieval/compose.json"
LOGGER = logging.getLogger("retrieval")
# Fixed public observation targets, kept beside the Compose model as reviewed data.
PROBES: dict[str, str] = json.loads(
    (ROOT / "deploy/local-retrieval/probes.json").read_text()
)
PROJECT_PREFIX = "pctv-retrieval-"
OWNER_LABEL = "org.popcorntv.retrieval"
PROJECT_LABEL = "com.docker.compose.project"
CLIENT_PROFILE = "config/qBittorrent"
WIREGUARD_FILE = "wg0.conf"
LOCK_FILE = ".lock"
MANIFEST_FILE = "installation.json"
ARM64_PLATFORM = "linux/arm64"
MOUNT_COLUMNS = "TARGET,SOURCE,FSTYPE,OPTIONS,FSROOT,UUID"
CLIENT_API = "http://127.0.0.1:8080"
ARM64_RETRIEVAL_IMAGES = {
    "gluetun": "sha256:94ce30419071195543ee7c41d2545d85e09e6c1312540506e4049bb66a4d99eb",
    "client": (
        "lscr.io/linuxserver/qbittorrent:5.3.0_v2.1.2-ls487@"
        "sha256:dffee58e5cc149526339c36ffe0f48c98a0cd430038cdfdfb0a32c0d704890ec"
    ),
}


def native_retrieval_images() -> dict[str, str]:
    """Select only the reviewed immutable pins for the host architecture."""
    architecture = platform.machine()
    if architecture in ("aarch64", "arm64"):
        return ARM64_RETRIEVAL_IMAGES
    if architecture in ("x86_64", "amd64"):
        return {}
    raise Refusal("retrieval_architecture_unqualified")


def command(arguments: list[str], data: str | None = None) -> str:
    """Run one bounded process while suppressing all credential-bearing raw output."""
    try:
        result = subprocess.run(
            arguments,
            input=data,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        if result.returncode:
            LOGGER.error(
                "retrieval.command_failed executable=%s exit=%d",
                Path(arguments[0]).name,
                result.returncode,
            )
            raise Refusal("external_command_failed")
        return result.stdout
    except (OSError, subprocess.TimeoutExpired):
        raise Refusal("external_command_unavailable") from None


def storage(path: Path, *, require_writable: bool = True) -> Storage:
    """Verify the exact mounted filesystem and its live capacity before any mutation."""
    if "$" in str(path):
        raise Refusal("storage_interpolation_character")
    if path.absolute() != path.resolve() or not path.is_mount():
        raise Refusal("storage_mount_required")
    reject_media_root(path, os.environ.get("MEDIA_ROOT"))
    mounted = command(
        [
            "findmnt",
            "--json",
            "--mountpoint",
            str(path),
            "--submounts",
            "--output",
            MOUNT_COLUMNS,
        ]
    )
    filesystem = os.statvfs(path)
    return storage_from_mount(
        path,
        mounted,
        filesystem.f_blocks * filesystem.f_frsize,
        filesystem.f_bavail * filesystem.f_frsize,
        require_writable=require_writable,
    )


def initialize(mount: Path, source: Path) -> Path:
    """Create private state once on the verified bounded mount, preserving foreign state.

    A failed initialization retains its incomplete private directory for inspection;
    no retry overwrites it. No Docker operation is performed here.
    """
    if os.getuid() == 0:
        raise Refusal("non_root_operator_required")
    verified = storage(mount)
    adapted = prepare_wireguard(source)
    subnet = select_subnet(network_inventory() + wireguard_networks(adapted))
    destination = mount / "retrieval"
    if destination.exists() or destination.is_symlink():
        raise Refusal("installation_already_exists")
    destination.mkdir(mode=0o700)
    password = new_password()
    (destination / "config").mkdir(mode=0o700)
    (destination / CLIENT_PROFILE).mkdir(mode=0o700)
    (destination / "downloads").mkdir(mode=0o700)
    write_private(destination / WIREGUARD_FILE, adapted)
    write_private(destination / "resolv.conf", "nameserver 127.0.0.1\n")
    write_private(destination / "password", password)
    write_private(
        destination / "credential.json",
        json.dumps(
            {
                "name": "local-retrieval-operator",
                "expires_at": (datetime.now(UTC) + timedelta(days=90)).isoformat(),
            }
        ),
    )
    write_private(
        destination / CLIENT_PROFILE / "qBittorrent.conf",
        client_settings(password, secrets.token_bytes(16)),
    )
    write_private(destination / LOCK_FILE, "")
    write_private(
        destination / MANIFEST_FILE,
        json.dumps(
            {
                "version": 2,
                "identity": secrets.token_hex(8),
                "storage_uuid": verified.uuid,
                "subnet": subnet,
                "wireguard_sha256": hashlib.sha256(adapted.encode()).hexdigest(),
            }
        ),
    )
    LOGGER.info("retrieval.initialized")
    return destination


def writable_directories(root: Path) -> None:
    """Confine every writable bind root to real private directories on the quota device.

    The mount inventory independently rejects submounts, including same-device binds.
    Stop deliberately does not need writable runtime directories to remain intact.
    """
    device = root.parent.stat().st_dev
    for path in (root / "downloads", root / "config", root / CLIENT_PROFILE):
        info = path.lstat()
        if (
            path.absolute() != path.resolve()
            or not stat.S_ISDIR(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o700
            or info.st_dev != device
        ):
            raise Refusal("writable_directory_unsafe")


def owned_root(root: Path) -> None:
    """Require the fixed private installation directory, owned by the operator."""
    if root.name != "retrieval" or root.absolute() != root.resolve():
        raise Refusal("installation_path")
    info = root.stat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
        raise Refusal("installation_permissions")


def installation_manifest(root: Path) -> dict[str, object]:
    """Read the exact ownership schema without interpreting transient paths as identity."""
    owned_root(root)
    try:
        manifest = json.loads(private_file(root / MANIFEST_FILE))
        if (
            not isinstance(manifest, dict)
            or set(manifest)
            != {"version", "identity", "wireguard_sha256", "subnet", "storage_uuid"}
            or type(manifest["version"]) is not int
            or manifest["version"] != 2
            or not isinstance(manifest["identity"], str)
            or re.fullmatch(r"[0-9a-f]{16}", manifest["identity"]) is None
            or not isinstance(manifest["storage_uuid"], str)
            or str(UUID(manifest["storage_uuid"])) != manifest["storage_uuid"]
            or not isinstance(manifest["wireguard_sha256"], str)
            or re.fullmatch(r"[0-9a-f]{64}", manifest["wireguard_sha256"]) is None
        ):
            raise Refusal("installation_manifest")
        subnet = ipaddress.ip_network(str(manifest["subnet"]))
        if subnet.version != 4 or subnet.prefixlen != 24 or not subnet.is_private:
            raise Refusal("installation_subnet")
        return dict(manifest)
    except (ValueError, TypeError, KeyError):
        raise Refusal("installation_manifest") from None


def identity_storage(mount: Path) -> Storage:
    """Validate the filesystem identity without the free-space gate.

    Stop must remain available at ENOSPC, so the reserve is not required here.
    """
    mounted = command(
        [
            "findmnt",
            "--json",
            "--mountpoint",
            str(mount),
            "--output",
            MOUNT_COLUMNS,
        ]
    )
    filesystem = os.statvfs(mount)
    return storage_from_mount(
        mount,
        mounted,
        filesystem.f_blocks * filesystem.f_frsize,
        FREE_RESERVE,
        require_writable=False,
    )


def verify_runtime_files(root: Path, manifest: dict[str, object]) -> None:
    """Reject changed tunnel input, expired credentials and missing private files."""
    writable_directories(root)
    adapted = private_file(root / WIREGUARD_FILE)
    wireguard_text(adapted)
    if hashlib.sha256(adapted.encode()).hexdigest() != manifest["wireguard_sha256"]:
        raise Refusal("installation_wireguard_changed")
    credential = json.loads(private_file(root / "credential.json"))
    if (
        not isinstance(credential, dict)
        or set(credential) != {"name", "expires_at"}
        or credential["name"] != "local-retrieval-operator"
        or not isinstance(credential["expires_at"], str)
    ):
        raise Refusal("credential_metadata_invalid")
    expiry = datetime.fromisoformat(credential["expires_at"])
    if expiry.tzinfo is None or expiry <= datetime.now(UTC):
        raise Refusal("credential_rotation_required")
    private_file(root / "password")
    private_file(root / "resolv.conf", 4096)
    private_file(root / CLIENT_PROFILE / "qBittorrent.conf", 1024 * 1024)


def installation(root: Path, require_reserve: bool = True) -> dict[str, object]:
    """Load an owned installation and reject input/namespace drift before operating it.

    Stop can bypass the free-space reserve but still requires bounded filesystem identity.
    """
    owned_root(root)
    verified = (
        storage(root.parent) if require_reserve else identity_storage(root.parent)
    )
    try:
        manifest = installation_manifest(root)
        if manifest["storage_uuid"] != verified.uuid:
            raise Refusal("installation_filesystem_changed")
        if require_reserve:
            verify_runtime_files(root, manifest)
        return manifest
    except (ValueError, TypeError):
        raise Refusal("installation_manifest") from None


@contextmanager
def locked(root: Path) -> Iterator[None]:
    """Serialize all lifecycle commands on the private existing installation lock."""
    private_file(root / LOCK_FILE)
    descriptor = os.open(root / LOCK_FILE, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "r") as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refusal("installation_busy") from None
        yield


def compose_model(root: Path, identity: str) -> dict[str, object]:
    """Resolve only local path/UID substitutions and attach an unguessable ownership label."""
    if os.getuid() == 0:
        raise Refusal("non_root_operator_required")
    if "$" in str(root):
        raise Refusal("storage_interpolation_character")
    raw = COMPOSE.read_text()
    substitutions = {
        "RETRIEVAL_ROOT": str(root),
        "RETRIEVAL_UID": str(os.getuid()),
        "RETRIEVAL_GID": str(os.getgid()),
    }

    # Substitute after JSON decoding so paths are never interpreted as JSON fragments.
    def replace(value: object) -> object:
        if isinstance(value, str):
            for key, content in substitutions.items():

                def replacement(_: re.Match[str], text: str = content) -> str:
                    return text

                value = re.sub(
                    r"\$\{" + key + r"(?::\?[^}]*)?\}",
                    replacement,
                    value,
                )
            return value
        if isinstance(value, list):
            return [replace(item) for item in value]
        if isinstance(value, dict):
            return {key: replace(item) for key, item in value.items()}
        return value

    model = json.loads(json.dumps(replace(json.loads(raw))))
    manifest = json.loads(private_file(root / MANIFEST_FILE))
    model["networks"]["egress"]["ipam"] = {"config": [{"subnet": manifest["subnet"]}]}
    model["name"] = PROJECT_PREFIX + identity
    native_images = native_retrieval_images()
    for name, service in model["services"].items():
        if name in native_images:
            service.update(
                image=native_images[name], platform=ARM64_PLATFORM, pull_policy="never"
            )
        service["container_name"] = PROJECT_PREFIX + identity + "-" + name
        service["labels"] = {OWNER_LABEL: identity}
    return {str(key): value for key, value in model.items()}


def docker_ranges(identity: str | None) -> tuple[list[str], set[str]]:
    """Return foreign Docker IPv4 subnets and the bridge devices of the owned project."""
    occupied: list[str] = []
    owned_devices: set[str] = set()
    identifiers = command(["docker", "network", "ls", "--quiet"]).splitlines()
    if not identifiers:
        return occupied, owned_devices
    project = PROJECT_PREFIX + identity if identity else None
    for network in json.loads(command(["docker", "network", "inspect", *identifiers])):
        own = bool(
            project and (network.get("Labels") or {}).get(PROJECT_LABEL) == project
        )
        subnets = [
            str(record["Subnet"])
            for record in network.get("IPAM", {}).get("Config") or []
            if record.get("Subnet") and ":" not in record["Subnet"]
        ]
        if not own:
            occupied.extend(subnets)
        elif subnets:
            owned_devices.add("br-" + network["Id"][:12])
    return occupied, owned_devices


def network_inventory(identity: str | None = None) -> list[str]:
    """Read host/Docker ranges, omitting only the owned bridge and its connected route."""
    try:
        routes = json.loads(
            command(["ip", "-json", "-4", "route", "show", "table", "all"])
        )
        occupied, owned_devices = docker_ranges(identity)
        occupied.extend(
            str(route["dst"])
            for route in routes
            if "dst" in route
            and route["dst"] not in {"default", FULL_IPV4}
            and route.get("dev") not in owned_devices
        )
        return occupied
    except (ValueError, KeyError, TypeError):
        raise Refusal("network_inventory_invalid") from None


def verify_network_plan(root: Path, identity: str) -> None:
    """Reject newly conflicting host or foreign Docker ranges before lifecycle mutation."""
    manifest = json.loads(private_file(root / MANIFEST_FILE))
    candidate = ipaddress.ip_network(manifest["subnet"])
    if any(
        candidate.overlaps(ipaddress.ip_network(value, strict=False))
        for value in network_inventory(identity)
        + wireguard_networks(private_file(root / WIREGUARD_FILE))
    ):
        raise Refusal("network_subnet_collision")


def compose(root: Path, identity: str, arguments: list[str]) -> str:
    """Use stdin for the resolved non-secret Compose model and a fixed project identity."""
    return command(
        [
            "docker",
            "compose",
            "--project-name",
            PROJECT_PREFIX + identity,
            "--file",
            "-",
            *arguments,
        ],
        json.dumps(compose_model(root, identity)),
    )


def owned_names(
    identity: str, project: str, read: Callable[[list[str]], str]
) -> set[str]:
    """List container names carrying either the ownership nonce or the project label."""
    names: set[str] = set()
    for label in (OWNER_LABEL + "=" + identity, PROJECT_LABEL + "=" + project):
        names.update(
            read(
                [
                    "docker",
                    "ps",
                    "-a",
                    "--filter",
                    "label=" + label,
                    "--format",
                    "{{.Names}}",
                ]
            ).splitlines()
        )
    return names


def owned_container(
    item: object, names: set[str], identity: str, project: str
) -> tuple[str, str]:
    """Return the proven name and immutable ID of one inspected owned container."""
    if not isinstance(item, dict):
        raise Refusal("container_inspection_invalid")
    name = item["Name"].lstrip("/")
    identifier = item["Id"]
    labels = item["Config"]["Labels"]
    state = item.get("State")
    if not isinstance(state, dict) or type(state.get("Running")) is not bool:
        raise Refusal("container_inspection_invalid")
    role = name.removeprefix(project + "-")
    if (
        name not in names
        or not isinstance(identifier, str)
        or re.fullmatch(r"[0-9a-f]{64}", identifier) is None
        or labels.get(OWNER_LABEL) != identity
        or labels.get(PROJECT_LABEL, project) != project
        or labels.get("com.docker.compose.service", role) != role
    ):
        raise Refusal("container_ownership")
    return name, identifier


def inspect_owned(
    identity: str, *, reader: Callable[[list[str]], str] | None = None
) -> list[dict[str, object]]:
    """Prove exact names/IDs and nonce ownership across both lifecycle selectors.

    A Compose-project collision must not be invisible before startup. Missing Compose
    labels do not prevent an emergency stop by a proven immutable container ID.
    """
    read = reader if reader is not None else command
    project = PROJECT_PREFIX + identity
    names = owned_names(identity, project, read)
    expected = {project + "-" + role for role in ("client", "gluetun")}
    if not names.issubset(expected):
        raise Refusal("container_ownership")
    if not names:
        return []
    try:
        result = json.loads(read(["docker", "inspect", *sorted(names)]))
        if not isinstance(result, list) or len(result) != len(names):
            raise Refusal("container_inspection_invalid")
        observed_names: set[str] = set()
        observed_ids: set[str] = set()
        for item in result:
            name, identifier = owned_container(item, names, identity, project)
            if name in observed_names or identifier in observed_ids:
                raise Refusal("container_ownership")
            observed_names.add(name)
            observed_ids.add(identifier)
        return result
    except (ValueError, KeyError, TypeError, AttributeError):
        raise Refusal("container_inspection_invalid") from None


def qualify_images(root: Path, identity: str) -> None:
    """Scan both exact pinned images before starting either service; no cached boolean bypass."""
    model = compose_model(root, identity)
    # Parse the locally controlled model at this process boundary.
    services = json.loads(json.dumps(model))["services"]
    for service in services.values():
        if service.get("platform") == ARM64_PLATFORM:
            configured = command(
                [
                    "docker",
                    "image",
                    "inspect",
                    "--format",
                    "{{.Os}}/{{.Architecture}}",
                    service["image"],
                ]
            ).strip()
            if configured != ARM64_PLATFORM:
                raise Refusal("retrieval_image_platform")
        command(
            [
                "make",
                "--no-print-directory",
                "-C",
                str(ROOT),
                "scan-docker-image",
                "TRIVY_EXIT=1",
                "IMAGE=" + service["image"],
            ]
        )
    LOGGER.info("retrieval.images_qualified")


def authenticate(root: Path, identity: str) -> dict[str, object]:
    """Authenticate over container loopback, keeping password/cookies in process stdin only."""
    client = PROJECT_PREFIX + identity + "-client"
    password = private_file(root / "password")
    body = urllib.parse.urlencode({"username": "operator", "password": password})
    common = [
        "docker",
        "exec",
        "-i",
        client,
        "curl",
        "--silent",
        "--show-error",
        "--fail",
        "--connect-timeout",
        "3",
        "--max-time",
        "8",
        "--config",
        "-",
    ]
    referer = 'header = "Referer: ' + CLIENT_API + '/"\n'
    response = command(
        common,
        'url = "'
        + CLIENT_API
        + '/api/v2/auth/login"\n'
        + referer
        + 'dump-header = "-"\ndata = "'
        + body
        + '"\n',
    )
    cookies = re.findall(
        r"(?im)^set-cookie:\s*((?:SID|QBT_SID_\d{1,5})=[a-z0-9_~.+/=-]{1,512});",
        response,
    )
    body = response.replace("\r\n", "\n").rsplit("\n\n", 1)[-1].strip()
    if len(cookies) != 1 or body not in {"", "Ok."}:
        raise Refusal("client_authentication")
    cookie = 'cookie = "' + cookies[0] + '"\n'
    preferences = command(
        common,
        'url = "' + CLIENT_API + '/api/v2/app/preferences"\n' + referer + cookie,
    )
    value = json.loads(preferences)
    if not isinstance(value, dict):
        raise Refusal("client_preferences")
    if any(value.get(key) is not False for key in ("dht", "pex", "lsd", "upnp")):
        raise Refusal("client_peer_discovery_enabled")
    if value.get("bypass_local_auth") is not False:
        raise Refusal("client_authentication_bypass")
    if value.get("current_network_interface") != "tun0":
        raise Refusal("client_tunnel_binding")
    torrents = command(
        common,
        'url = "' + CLIENT_API + '/api/v2/torrents/info"\n' + referer + cookie,
    )
    if json.loads(torrents) != []:
        raise Refusal("client_queue_not_empty")
    return value


def reject_alternate_resume_storage(profile: Path) -> None:
    """The bencode-only preflight cannot establish that a SQLite queue is empty."""
    for suffix in ("", "-wal", "-shm", "-journal"):
        try:
            (profile / ("torrents.db" + suffix)).lstat()
        except FileNotFoundError:
            continue
        raise Refusal("unsupported_resume_storage")


def empty_persisted_queue(root: Path) -> None:
    """Refuse saved state before starting an Internet-capable empty client."""
    profile = root / CLIENT_PROFILE
    reject_alternate_resume_storage(profile)
    directory = profile / "BT_backup"
    if directory.is_symlink() or (directory.exists() and any(directory.iterdir())):
        raise Refusal("persisted_transfer_state_present")


def trace_address(trace: str) -> str:
    """Parse one bounded public IPv4 observation; never expose the returned address."""
    addresses = re.findall(r"(?m)^ip=([^\r\n]+)$", trace)
    if len(addresses) != 1 or not ipaddress.IPv4Address(addresses[0]).is_global:
        raise Refusal("egress_observation_invalid")
    return str(addresses[0])


def tmpfs_policy(value: str) -> frozenset[str]:
    """Compare tmpfs options independent of order and equivalent binary size units.

    Reject duplicate keys so a later option cannot hide an earlier conflicting one.
    """
    options: set[str] = set()
    keys: set[str] = set()
    for token in value.split(","):
        key = token.split("=", 1)[0]
        if not key or key in keys:
            raise Refusal("effective_tmpfs_drift")
        keys.add(key)
        match = re.fullmatch(r"size=(\d+)([kmg]?)", token.lower())
        if match:
            scale = {"": 1, "k": 1024, "m": 1024**2, "g": 1024**3}[match[2]]
            token = "size=" + str(int(match[1]) * scale)
        options.add(token)
    return frozenset(options)


def verify_filesystem_policy(
    actual: dict[str, object], expected: dict[str, object]
) -> None:
    """Reject extra volumes and changed bind roots or tmpfs budgets without any I/O."""
    container = json.loads(json.dumps(actual))
    planned = json.loads(json.dumps(expected))
    planned_tmpfs = {
        path: options
        for path, options in (item.split(":", 1) for item in planned["tmpfs"])
    }
    observed_tmpfs = container["HostConfig"].get("Tmpfs")
    if not isinstance(observed_tmpfs, dict) or not all(
        isinstance(path, str) and isinstance(options, str)
        for path, options in observed_tmpfs.items()
    ):
        raise Refusal("effective_tmpfs_drift")
    if {path: tmpfs_policy(options) for path, options in observed_tmpfs.items()} != {
        path: tmpfs_policy(options) for path, options in planned_tmpfs.items()
    }:
        raise Refusal("effective_tmpfs_drift")
    binds = []
    for mount in container["Mounts"]:
        if mount["Type"] == "bind":
            binds.append((mount["Source"], mount["Destination"], mount["RW"]))
        elif mount["Type"] != "tmpfs" or mount["Destination"] not in planned_tmpfs:
            raise Refusal("effective_mount_drift")
    planned_binds = [
        (item["source"], item["target"], not item.get("read_only", False))
        for item in planned["volumes"]
    ]
    if len(binds) != len(planned_binds) or set(binds) != set(planned_binds):
        raise Refusal("effective_mount_drift")


def verify_execution_policy(
    actual: dict[str, object], expected: dict[str, object]
) -> None:
    """Require the reviewed process, bounded logs and disabled automatic restart."""
    container = json.loads(json.dumps(actual))
    planned = json.loads(json.dumps(expected))
    if container["Config"].get("Entrypoint") != planned["entrypoint"] or container[
        "Config"
    ].get("Cmd") not in (None, planned["command"]):
        raise Refusal("effective_process_drift")
    if container["HostConfig"].get("LogConfig") != {
        "Type": planned["logging"]["driver"],
        "Config": planned["logging"]["options"],
    }:
        raise Refusal("effective_logging_drift")
    if container["HostConfig"].get("RestartPolicy") != {
        "Name": planned["restart"],
        "MaximumRetryCount": 0,
    }:
        raise Refusal("effective_restart_drift")


def verify_container_configuration(
    observation: dict[str, object], policy: dict[str, object], role: str, identity: str
) -> None:
    """Apply pure effective-policy checks before any credential or egress operation."""
    actual = json.loads(json.dumps(observation))
    expected = json.loads(json.dumps(policy))
    host = actual["HostConfig"]
    if (
        actual["State"].get("Health", {}).get("Status") != "healthy"
        or actual["Config"]["Image"] != expected["image"]
        or actual["Config"].get("Labels", {}).get(OWNER_LABEL) != identity
        or host["Privileged"]
        or not host["ReadonlyRootfs"]
        or host.get("PortBindings")
        or set(host["CapDrop"] or []) != {"ALL"}
        or "no-new-privileges:true" not in host["SecurityOpt"]
        or host["Memory"] != (256 if role == "gluetun" else 768) * 1024**2
        or host["PidsLimit"] != (64 if role == "gluetun" else 128)
        or host["NanoCpus"] != (500000000 if role == "gluetun" else 1000000000)
        or actual["Config"]["User"] != expected["user"]
    ):
        raise Refusal("effective_container_drift")
    effective_env = set(actual["Config"].get("Env") or [])
    planned_env = {f"{key}={value}" for key, value in expected["environment"].items()}
    if not planned_env.issubset(effective_env):
        raise Refusal("effective_environment_drift")
    # The pinned custom gateway inherits only Alpine's fixed PATH. Do not
    # accept extra firewall, routing or resolver switches from a replacement.
    if role == "gluetun" and effective_env - planned_env - {
        "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    }:
        raise Refusal("effective_gateway_environment_drift")
    verify_filesystem_policy(observation, policy)
    verify_execution_policy(observation, policy)


def verify_namespace(
    gateway: dict[str, object], client: dict[str, object], identity: str
) -> None:
    """Require one shared gateway namespace with local DNS, no IPv6 and no extra network."""
    gate = json.loads(json.dumps(gateway))
    peer = json.loads(json.dumps(client))
    prefix = PROJECT_PREFIX + identity + "-"
    if peer["HostConfig"]["NetworkMode"] != "container:" + gate["Id"]:
        raise Refusal("effective_namespace_drift")
    if peer["HostConfig"].get("CapAdd") or peer["NetworkSettings"]["Networks"]:
        raise Refusal("effective_client_network_or_capabilities")
    expected_network = PROJECT_PREFIX + identity + "_egress"
    if set(gate["NetworkSettings"]["Networks"]) != {expected_network}:
        raise Refusal("effective_gateway_networks")
    if gate["HostConfig"].get("Dns") != ["127.0.0.1"]:
        raise Refusal("effective_dns_drift")
    for role in ("gluetun", "client"):
        resolvers = command(
            ["docker", "exec", prefix + role, "cat", "/etc/resolv.conf"]
        )
        if re.findall(r"(?m)^nameserver\s+(\S+)", resolvers) != ["127.0.0.1"]:
            raise Refusal("effective_dns_drift")
    ipv6 = command(
        [
            "docker",
            "exec",
            prefix + "client",
            "cat",
            "/proc/sys/net/ipv6/conf/all/disable_ipv6",
        ]
    )
    if ipv6.strip() != "1":
        raise Refusal("effective_ipv6_enabled")
    if {cap.removeprefix("CAP_") for cap in gate["HostConfig"].get("CapAdd") or []} != {
        "NET_ADMIN",
        "DAC_OVERRIDE",
    }:
        raise Refusal("effective_gateway_capabilities")
    namespaces = [
        command(["docker", "exec", prefix + role, "readlink", "/proc/1/ns/net"]).strip()
        for role in ("client", "gluetun")
    ]
    if not namespaces[0].startswith("net:[") or namespaces[0] != namespaces[1]:
        raise Refusal("effective_namespace_identity")


def verify_anonymous_denied(client: str) -> None:
    """Require the client API to refuse an unauthenticated loopback request."""
    anonymous = command(
        [
            "docker",
            "exec",
            client,
            "curl",
            "--silent",
            "--max-time",
            "8",
            "--output",
            "/dev/null",
            "--write-out",
            "%{http_code}",
            CLIENT_API + "/api/v2/app/preferences",
        ]
    )
    if anonymous != "403":
        raise Refusal("anonymous_client_api")


def verify_egress(client: str) -> None:
    """Require the client's public address to differ from the host's own."""
    endpoint = PROBES["trace_ipv4"]
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(endpoint, timeout=8) as response:
        baseline = trace_address(response.read(8193).decode())
    observed = trace_address(
        command(
            [
                "docker",
                "exec",
                client,
                "curl",
                "--silent",
                "--fail",
                "--connect-timeout",
                "3",
                "--max-time",
                "8",
                endpoint,
            ]
        )
    )
    if observed == baseline:
        raise Refusal("host_egress_observed")


def verify(root: Path, identity: str) -> None:
    """Check effective container isolation, authenticated API and non-host public egress.

    This verifies connected operation only. Failure-injection acceptance remains
    separate and acquisition is never enabled by a successful verification.
    """
    try:
        containers = json.loads(json.dumps(inspect_owned(identity)))
        if len(containers) != 2:
            raise Refusal("installation_not_running")
        by_name = {item["Name"].lstrip("/"): item for item in containers}
        prefix = PROJECT_PREFIX + identity + "-"
        gateway, client = (by_name[prefix + role] for role in ("gluetun", "client"))
        model = json.loads(json.dumps(compose_model(root, identity)))
        for role, actual in (("gluetun", gateway), ("client", client)):
            verify_container_configuration(
                actual, model["services"][role], role, identity
            )
        verify_namespace(gateway, client, identity)
        authenticate(root, identity)
        verify_anonymous_denied(prefix + "client")
        verify_egress(prefix + "client")
        LOGGER.info("retrieval.connected_verified_acquisition_disabled")
    except (ValueError, KeyError, TypeError, OSError):
        raise Refusal("verification_unavailable") from None


def stop(root: Path, identity: str) -> None:
    """Stop the proven client ID before gateway ID and confirm each stopped state."""
    if installation_manifest(root)["identity"] != identity:
        raise Refusal("container_ownership")
    containers = json.loads(json.dumps(inspect_owned(identity)))
    by_name = {item["Name"].lstrip("/"): item for item in containers}
    failures = []
    for role in ("client", "gluetun"):
        item = by_name.get(PROJECT_PREFIX + identity + "-" + role)
        if item is None:
            continue
        identifier = item["Id"]
        try:
            command(["docker", "stop", "--time", "20", identifier])
            stopped = json.loads(command(["docker", "inspect", identifier]))
            if (
                not isinstance(stopped, list)
                or len(stopped) != 1
                or stopped[0].get("Id") != identifier
                or stopped[0].get("State", {}).get("Running") is not False
            ):
                raise Refusal("stop_unconfirmed")
        except (Refusal, ValueError, KeyError, TypeError, AttributeError):
            failures.append(role)
    if failures:
        raise Refusal("stop_unconfirmed")
    LOGGER.info("retrieval.stopped")


def remove_stopped(root: Path, identity: str) -> None:
    """Remove only re-inspected owned stopped IDs, without force or volume deletion."""
    if installation_manifest(root)["identity"] != identity:
        raise Refusal("container_ownership")
    containers = json.loads(json.dumps(inspect_owned(identity)))
    by_name = {item["Name"].lstrip("/"): item for item in containers}
    if any(item.get("State", {}).get("Running") is not False for item in containers):
        raise Refusal("removal_requires_stopped_services")
    for role in ("client", "gluetun"):
        item = by_name.get(PROJECT_PREFIX + identity + "-" + role)
        if item is not None:
            command(["docker", "rm", item["Id"]])


def start(root: Path, identity: str) -> None:
    """Qualify artifacts, replace the owned namespace/client in order, and verify startup.

    Any failure after mutation attempts an ordered stop. Failure is never presented
    as readiness and the private installation is retained for diagnosis.
    """
    inspect_owned(identity)
    empty_persisted_queue(root)
    verify_network_plan(root, identity)
    qualify_images(root, identity)
    try:
        stop(root, identity)
        remove_stopped(root, identity)
        compose(root, identity, ["up", "--detach", "--wait", "--wait-timeout", "90"])
        verify(root, identity)
    except (
        Refusal,
        OSError,
        ValueError,
        KeyError,
        TypeError,
        KeyboardInterrupt,
    ) as failure:
        try:
            stop(root, identity)
        except Refusal:
            raise Refusal("startup_and_cleanup_failed") from None
        if isinstance(failure, (Refusal, KeyboardInterrupt)):
            raise
        raise Refusal("startup_verification_failed") from None


def lifecycle(operation: str, root: Path) -> None:
    """Run one locked lifecycle operation, withdrawing the installation on failure."""
    with locked(root):
        # Establish ownership independently of runtime files and expiry so
        # failed preflight/status can still withdraw the owned installation.
        manifest = installation(root, require_reserve=False)
        identity = str(manifest["identity"])
        if operation == "stop":
            stop(root, identity)
            return
        try:
            installation(root)
            if operation == "start":
                start(root, identity)
            else:
                verify(root, identity)
        except (Refusal, OSError, ValueError, KeyError, TypeError):
            try:
                stop(root, identity)
            except Refusal:
                raise Refusal("verification_and_cleanup_failed") from None
            raise


def refusal(args: argparse.Namespace) -> str | None:
    """Run the requested operation and return its categorical refusal, if any."""
    try:
        if args.operation != "init":
            lifecycle(args.operation, args.storage / "retrieval")
        elif args.wireguard is None:
            raise Refusal("wireguard_path_required")
        else:
            initialize(args.storage, args.wireguard)
    except Refusal as error:
        return str(error)
    except (OSError, ValueError, KeyError, TypeError):
        return "invalid_state_or_io"
    return None


def main() -> int:
    """Expose explicit initialization and lifecycle operations with categorical errors only."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("init", "start", "status", "stop"))
    parser.add_argument("--storage", required=True, type=Path)
    parser.add_argument("--wireguard", type=Path)
    reason = refusal(parser.parse_args())
    if reason is None:
        return 0
    # The traceback is deliberately not logged: diagnostics stay categorical.
    LOGGER.error("retrieval.refused reason=%s", reason)
    return 1


if __name__ == "__main__":
    sys.exit(main())
