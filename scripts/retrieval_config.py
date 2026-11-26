"""Validate private retrieval inputs without exposing their contents in diagnostics."""

from __future__ import annotations

import base64
import configparser
import hashlib
import io
import ipaddress
import json
import os
import secrets
import socket
import stat
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

GIB = 1024**3
MAX_STORAGE = 100 * GIB
FREE_RESERVE = 2 * GIB


class Refusal(RuntimeError):
    """Carry only a fixed categorical refusal suitable for public CLI diagnostics."""


class WireGuardParser(configparser.ConfigParser):
    """Preserve WireGuard's case-sensitive field names without interpolation."""

    def optionxform(self, optionstr: str) -> str:
        """Leave field names unchanged so unknown capitalization is refused."""
        return optionstr


def private_file(path: Path, limit: int = 16384) -> str:
    """Read an owned 0600 regular file without following its final symlink.

    Reject symlink ancestors as well. Parse errors must be translated by the caller;
    this function never includes the source path or content in its own refusals.
    """
    absolute = path.absolute()
    if absolute != absolute.resolve():
        raise Refusal("private_file_symlink")
    descriptor = os.open(absolute, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.getuid()
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_nlink != 1
            or info.st_size > limit
        ):
            raise Refusal("private_file_unsafe")
        content = stream.read(limit + 1)
    if len(content) > limit:
        raise Refusal("private_file_too_large")
    return content.decode("utf-8")


def wireguard_text(source: str, endpoint_address: str | None = None) -> str:
    """Return allowlisted numeric-endpoint WireGuard text, omitting source DNS.

    Do not execute configuration hooks. A caller may supply a separately resolved
    public IPv4 endpoint; client traffic never uses the host resolver as a fallback.
    All errors become categorical; the owner's original file is never rewritten.
    """
    try:
        config = WireGuardParser(interpolation=None)
        config.read_string(source)
        allowed = {
            "Interface": {"PrivateKey", "Address", "DNS"},
            "Peer": {"PublicKey", "AllowedIPs", "Endpoint", "PersistentKeepalive"},
        }
        if config.defaults() or set(config.sections()) != set(allowed):
            raise Refusal("wireguard_sections")
        for section, fields in allowed.items():
            if not set(config[section]).issubset(fields):
                raise Refusal("wireguard_fields")
        for section, key in (("Interface", "PrivateKey"), ("Peer", "PublicKey")):
            if len(base64.b64decode(config[section][key], validate=True)) != 32:
                raise Refusal("wireguard_key")
        for interface_address in config["Interface"]["Address"].split(","):
            ipaddress.ip_interface(interface_address.strip())
        routes = {
            ipaddress.ip_network(value.strip())
            for value in config["Peer"]["AllowedIPs"].split(",")
        }
        if ipaddress.ip_network("0.0.0.0/0") not in routes:
            raise Refusal("wireguard_full_ipv4_required")
        if routes - {
            ipaddress.ip_network("0.0.0.0/0"),
            ipaddress.ip_network("::/0"),
        }:
            raise Refusal("wireguard_extra_routes")
        endpoint, port = config["Peer"]["Endpoint"].rsplit(":", 1)
        address = ipaddress.IPv4Address(endpoint_address or endpoint)
        if not address.is_global or not 1 <= int(port) <= 65535:
            raise Refusal("wireguard_endpoint")
        keepalive = config["Peer"].get("PersistentKeepalive", "0")
        if not 0 <= int(keepalive) <= 65535:
            raise Refusal("wireguard_keepalive")
        config.remove_option("Interface", "DNS")
        config["Peer"]["Endpoint"] = f"{address}:{int(port)}"
        # IPv6 is deliberately unsupported in the first installation.
        config["Peer"]["AllowedIPs"] = "0.0.0.0/0"
        output = io.StringIO()
        config.write(output)
        return output.getvalue()
    except (configparser.Error, ValueError, KeyError, UnicodeError):
        raise Refusal("wireguard_invalid") from None


def prepare_wireguard(path: Path) -> str:
    """Read the existing owner's file and pin its endpoint's public IPv4 resolution.

    Only VPN endpoint bootstrap may use host DNS. Refuse mixed private/public
    answers and never resolve the endpoint again inside the client namespace.
    """
    source = private_file(path)
    try:
        config = WireGuardParser(interpolation=None)
        config.read_string(source)
        endpoint, port = config["Peer"]["Endpoint"].rsplit(":", 1)
        answers = socket.getaddrinfo(
            endpoint, int(port), socket.AF_INET, socket.SOCK_DGRAM
        )
        addresses = [str(answer[4][0]) for answer in answers]
        if not addresses or not all(
            ipaddress.IPv4Address(value).is_global for value in addresses
        ):
            raise Refusal("wireguard_endpoint_resolution")
        return wireguard_text(source, addresses[0])
    except (configparser.Error, KeyError, ValueError, OSError):
        raise Refusal("wireguard_endpoint_resolution") from None


def client_settings(password: str, salt: bytes) -> str:
    """Prepare qBittorrent authentication and disabled peer discovery before startup.

    PBKDF2-SHA512 is qBittorrent's native password format, not an application protocol.
    The initializer supplies a password of at least 32 characters and a 16-byte
    random salt; invalid lengths raise Refusal.
    """
    if len(password) < 32 or len(salt) != 16:
        raise Refusal("client_password_input")
    digest = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000, 64)
    encoded = base64.b64encode(salt).decode() + ":" + base64.b64encode(digest).decode()
    return (
        "[LegalNotice]\nAccepted=true\n"
        "[BitTorrent]\nSession\\DHTEnabled=false\nSession\\PeXEnabled=false\n"
        "Session\\LSDEnabled=false\nSession\\Port=6881\n"
        "Session\\DefaultSavePath=/data/\nSession\\MaxActiveDownloads=1\n"
        "Session\\MaxActiveTorrents=1\nSession\\QueueingSystemEnabled=true\n"
        "Session\\Interface=tun0\nSession\\InterfaceName=tun0\n"
        "[Preferences]\nConnection\\UPnP=false\nGeneral\\CheckForUpdates=false\n"
        "WebUI\\Username=operator\nWebUI\\LocalHostAuth=true\n"
        "WebUI\\AuthSubnetWhitelistEnabled=false\nWebUI\\CSRFProtection=true\n"
        "WebUI\\HostHeaderValidation=true\n"
        'WebUI\\Password_PBKDF2="@ByteArray(' + encoded + ')"\n'
    )


@dataclass(frozen=True)
class Storage:
    """Verified dedicated filesystem identity and actual capacity, not a user claim."""

    path: Path
    source: str
    uuid: str
    capacity: int
    free: int


def storage_from_mount(
    path: Path,
    mount_json: str,
    capacity: int,
    free: int,
    *,
    require_writable: bool = True,
) -> Storage:
    """Require an exclusive ext4/XFS mount with at most the accepted 100 GiB ceiling.

    A dedicated bounded block filesystem avoids trusting application limits or an
    unverified directory quota. Capacity/free come from statvfs at the same mount.
    """
    try:
        payload = json.loads(mount_json)
        mounts = payload["filesystems"]
        if not isinstance(mounts, list) or len(mounts) != 1:
            raise Refusal("storage_mount_ambiguous")
        mount = mounts[0]
        if mount.get("children"):
            raise Refusal("storage_submounts_forbidden")
        if (
            mount["target"] != str(path)
            or mount["fstype"] not in {"ext4", "xfs"}
            or not mount["source"].startswith("/dev/")
            or mount.get("fsroot", "/") != "/"
        ):
            raise Refusal("storage_dedicated_filesystem_required")
        if not isinstance(mount.get("uuid"), str):
            raise Refusal("storage_uuid_required")
        identity = str(UUID(mount["uuid"]))
        if UUID(identity).int == 0:
            raise Refusal("storage_uuid_required")
        options = set(mount["options"].split(","))
        required = {"nodev", "nosuid", "noexec"}
        if require_writable:
            required.add("rw")
        if not required.issubset(options) or not {"rw", "ro"}.intersection(options):
            raise Refusal("storage_mount_options")
        if not FREE_RESERVE < capacity <= MAX_STORAGE or free < FREE_RESERVE:
            raise Refusal("storage_capacity_or_reserve")
        return Storage(path, mount["source"], identity, capacity, free)
    except (ValueError, KeyError, TypeError):
        raise Refusal("storage_mount_invalid") from None


def reject_media_root(path: Path, media_root: str | None) -> None:
    """Refuse a retrieval mount that contains, or sits inside, the owner's library.

    The retrieval cache never shares a tree with ``MEDIA_ROOT``: deletion and
    trimming of retrieved files must be unable to reach the owner's own media.
    An unset or empty value means no library is declared on this host.
    """
    if not media_root:
        return
    library = Path(media_root).resolve()
    mount = path.resolve()
    if mount == library or library in mount.parents or mount in library.parents:
        raise Refusal("storage_inside_media_root")


def write_private(path: Path, value: str) -> None:
    """Create a new private file exclusively; never replace or truncate existing state."""
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())


def new_password() -> str:
    """Return a local generated operator password, never intended for CLI output."""
    return secrets.token_hex(32)


def select_subnet(occupied: list[str]) -> str:
    """Choose a private /24 disjoint from observed nondefault host/VPN/Docker ranges."""
    networks = [ipaddress.ip_network(value, strict=False) for value in occupied]
    for prefix in ("172.30", "10.231", "192.168"):
        for third in range(200, 255):
            candidate = ipaddress.ip_network(f"{prefix}.{third}.0/24")
            if not any(candidate.overlaps(network) for network in networks):
                return str(candidate)
    raise Refusal("no_collision_free_subnet")


def wireguard_networks(source: str) -> list[str]:
    """Return validated IPv4 interface networks for bridge collision checks."""
    adapted = wireguard_text(source)
    config = WireGuardParser(interpolation=None)
    config.read_string(adapted)
    return [
        str(ipaddress.ip_interface(value.strip()).network)
        for value in config["Interface"]["Address"].split(",")
        if ":" not in value
    ]
