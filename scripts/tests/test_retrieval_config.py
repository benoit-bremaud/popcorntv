"""Exercise private-input refusals and hard storage bounds before Docker can run."""

from __future__ import annotations

import base64
import configparser
import hashlib
import json
import os
import socket
from pathlib import Path

import pytest
from retrieval_config import (
    FREE_RESERVE,
    GIB,
    MAX_STORAGE,
    Refusal,
    client_settings,
    prepare_wireguard,
    private_file,
    reject_media_root,
    select_subnet,
    storage_from_mount,
    wireguard_text,
    write_private,
)


@pytest.fixture
def wireguard() -> str:
    """Use generated protocol-shaped material, never an owner's key."""
    private_key = base64.b64encode(bytes(range(32))).decode()
    public_key = base64.b64encode(bytes(reversed(range(32)))).decode()
    return (
        f"[Interface]\nPrivateKey={private_key}\nAddress=10.7.0.2/32\nDNS=10.7.0.1\n"
        f"[Peer]\nPublicKey={public_key}\nAllowedIPs=0.0.0.0/0,::/0\n"
        "Endpoint=1.1.1.1:51820\nPersistentKeepalive=25\n"
    )


def test_adaptation_preserves_keys_but_removes_dns_and_ipv6(wireguard: str) -> None:
    adapted = wireguard_text(wireguard)
    assert "DNS" not in adapted
    assert "::/0" not in adapted
    assert "Endpoint = 1.1.1.1:51820" in adapted
    original, converted = configparser.ConfigParser(), configparser.ConfigParser()
    original.read_string(wireguard)
    converted.read_string(adapted)
    assert original["Interface"]["PrivateKey"] != original["Peer"]["PublicKey"]
    assert converted["Interface"]["PrivateKey"] == original["Interface"]["PrivateKey"]
    assert converted["Peer"]["PublicKey"] == original["Peer"]["PublicKey"]
    assert wireguard_text(adapted) == adapted


@pytest.mark.parametrize(
    "before,after",
    [
        ("PrivateKey=", "PostUp=untrusted\nPrivateKey="),
        ("[Peer]", "[Extra]\nValue=x\n[Peer]"),
        ("Address=10.7.0.2/32", "Address=invalid"),
        ("AllowedIPs=0.0.0.0/0,::/0", "AllowedIPs=10.0.0.0/8"),
        ("AllowedIPs=0.0.0.0/0,::/0", "AllowedIPs=0.0.0.0/0,10.0.0.0/8"),
        ("Endpoint=1.1.1.1:51820", "Endpoint=127.0.0.1:51820"),
        ("Endpoint=1.1.1.1:51820", "Endpoint=1.1.1.1:65536"),
        ("Endpoint=1.1.1.1:51820", "Endpoint=1.1.1.1:0"),
        ("PersistentKeepalive=25", "PersistentKeepalive=-1"),
        ("PersistentKeepalive=25", "PersistentKeepalive=65536"),
        ("[Interface]", "[DEFAULT]\nPostUp=untrusted\n[Interface]"),
        ("PublicKey=", "UnknownKey="),
    ],
)
def test_unsafe_config_is_categorical(wireguard: str, before: str, after: str) -> None:
    secret_canary = "untrusted"
    with pytest.raises(Refusal) as captured:
        wireguard_text(wireguard.replace(before, after))
    assert secret_canary not in str(captured.value)
    assert "PrivateKey" not in str(captured.value)


@pytest.mark.parametrize("value", ["", "broken", "[Interface]\nPrivateKey=CANARY"])
def test_malformed_config_never_emits_source(value: str) -> None:
    with pytest.raises(Refusal, match="wireguard_") as captured:
        wireguard_text(value)
    assert "CANARY" not in str(captured.value)


def test_private_read_is_exclusive_and_preserves_original(tmp_path: Path) -> None:
    path = tmp_path / "private"
    write_private(path, "canary")
    assert private_file(path) == "canary"
    assert path.stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileExistsError):
        write_private(path, "replacement")
    assert private_file(path) == "canary"


@pytest.mark.parametrize("mode", [0o644, 0o640, 0o400, 0o666])
def test_private_read_refuses_permissions(tmp_path: Path, mode: int) -> None:
    path = tmp_path / "private"
    path.write_text("canary")
    path.chmod(mode)
    with pytest.raises(Refusal, match="private_file_unsafe"):
        private_file(path)


@pytest.mark.parametrize("kind", ["symlink", "hardlink", "fifo", "oversized"])
def test_private_read_refuses_special_files(tmp_path: Path, kind: str) -> None:
    path = tmp_path / "private"
    if kind == "fifo":
        os.mkfifo(path, 0o600)
    else:
        write_private(path, "x" * (16385 if kind == "oversized" else 1))
        if kind == "symlink":
            target = tmp_path / "link"
            target.symlink_to(path)
            path = target
        if kind == "hardlink":
            os.link(path, tmp_path / "second")
    with pytest.raises(Refusal):
        private_file(path)


def test_private_read_refuses_symlink_parent(tmp_path: Path) -> None:
    directory = tmp_path / "real"
    directory.mkdir()
    write_private(directory / "key", "canary")
    (tmp_path / "link").symlink_to(directory)
    with pytest.raises(Refusal):
        private_file(tmp_path / "link/key")


def test_endpoint_resolution_pins_public_address_without_mutating_source(
    tmp_path: Path, wireguard: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "source"
    original = wireguard.replace("1.1.1.1:51820", "vpn.example:51820")
    write_private(path, original)
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args: [(socket.AF_INET, socket.SOCK_DGRAM, 17, "", ("8.8.8.8", 51820))],
    )
    assert "Endpoint = 8.8.8.8:51820" in prepare_wireguard(path)
    assert path.read_text() == original


@pytest.mark.parametrize("addresses", [[], ["127.0.0.1"], ["8.8.8.8", "10.0.0.1"]])
def test_endpoint_resolution_refuses_empty_private_or_mixed_answers(
    tmp_path: Path,
    wireguard: str,
    monkeypatch: pytest.MonkeyPatch,
    addresses: list[str],
) -> None:
    path = tmp_path / "source"
    write_private(path, wireguard)
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args: [
            (socket.AF_INET, socket.SOCK_DGRAM, 17, "", (address, 51820))
            for address in addresses
        ],
    )
    with pytest.raises(Refusal, match="wireguard_endpoint_resolution"):
        prepare_wireguard(path)


def test_client_password_hash_matches_native_protocol() -> None:
    password, salt = "generated-test-password-material-1234", bytes(range(16))
    settings = client_settings(password, salt)
    expected = base64.b64encode(
        hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000, 64)
    ).decode()
    assert expected in settings
    assert password not in settings
    assert "WebUI\\LocalHostAuth=true" in settings
    assert "WebUI\\AuthSubnetWhitelistEnabled=false" in settings
    assert "Session\\Interface=tun0" in settings
    for name in ("DHT", "PeX", "LSD"):
        assert f"Session\\{name}Enabled=false" in settings


@pytest.mark.parametrize("password,salt", [("short", bytes(16)), ("x" * 32, bytes(15))])
def test_client_password_refuses_unsafe_inputs(password: str, salt: bytes) -> None:
    with pytest.raises(Refusal):
        client_settings(password, salt)


@pytest.fixture
def mount_record() -> dict[str, object]:
    return {
        "target": "/dedicated",
        "source": "/dev/loop-test",
        "uuid": "11111111-2222-4333-8444-555555555555",
        "fstype": "ext4",
        "options": "rw,nosuid,nodev,noexec,relatime",
        "fsroot": "/",
    }


def test_real_capacity_boundary_accepts_hard_ceiling(
    mount_record: dict[str, object],
) -> None:
    record = storage_from_mount(
        Path("/dedicated"),
        json.dumps({"filesystems": [mount_record]}),
        MAX_STORAGE,
        FREE_RESERVE,
    )
    assert record.capacity == MAX_STORAGE
    assert record.free == FREE_RESERVE


@pytest.mark.parametrize(
    "key,value",
    [
        ("target", "/"),
        ("source", "tmpfs"),
        ("fstype", "tmpfs"),
        ("fsroot", "/subdir"),
        ("options", "rw,nosuid,nodev"),
        ("options", "ro,nosuid,nodev,noexec"),
    ],
)
def test_storage_refuses_unbounded_or_shared_mount(
    mount_record: dict[str, object],
    key: str,
    value: str,
) -> None:
    mount_record[key] = value
    with pytest.raises(Refusal):
        storage_from_mount(
            Path("/dedicated"),
            json.dumps({"filesystems": [mount_record]}),
            MAX_STORAGE,
            FREE_RESERVE,
        )


@pytest.mark.parametrize(
    "capacity,free",
    [
        (MAX_STORAGE + 1, 4 * GIB),
        (FREE_RESERVE, FREE_RESERVE),
        (MAX_STORAGE, FREE_RESERVE - 1),
    ],
)
def test_storage_refuses_capacity_or_reserve_boundary(
    mount_record: dict[str, object],
    capacity: int,
    free: int,
) -> None:
    with pytest.raises(Refusal):
        storage_from_mount(
            Path("/dedicated"),
            json.dumps({"filesystems": [mount_record]}),
            capacity,
            free,
        )


@pytest.mark.parametrize(
    "payload",
    ["{}", "null", '{"filesystems":[]}', '{"filesystems":[{},{}]}', "invalid"],
)
def test_storage_refuses_malformed_observation(payload: str) -> None:
    with pytest.raises(Refusal):
        storage_from_mount(Path("/dedicated"), payload, MAX_STORAGE, FREE_RESERVE)


def test_subnet_selection_avoids_partial_or_broad_overlap() -> None:
    assert (
        select_subnet(["172.30.200.128/25", "172.30.201.0/24", "10.0.0.0/8"])
        == "172.30.202.0/24"
    )
    with pytest.raises(Refusal, match="no_collision_free_subnet"):
        select_subnet(["172.16.0.0/12", "10.0.0.0/8", "192.168.0.0/16"])


@pytest.mark.parametrize(
    "identity", [None, "", "not-a-uuid", 12, "00000000-0000-0000-0000-000000000000"]
)
def test_storage_requires_persistent_nonzero_uuid(
    mount_record: dict[str, object], identity: object
) -> None:
    mount_record["uuid"] = identity
    with pytest.raises(Refusal):
        storage_from_mount(
            Path("/dedicated"),
            json.dumps({"filesystems": [mount_record]}),
            MAX_STORAGE,
            FREE_RESERVE,
        )


@pytest.mark.parametrize("media_root", [None, "", "media", "./media", "None", " "])
def test_undeclared_or_relative_library_is_refused(media_root: str | None) -> None:
    with pytest.raises(Refusal, match="media_root_undeclared"):
        reject_media_root(Path("/srv/retrieval/mount"), media_root)


def test_host_declared_without_a_library_accepts_any_mount() -> None:
    reject_media_root(Path("/srv/retrieval/mount"), "none")


@pytest.mark.parametrize(
    "library", ["media", "retrieval/mount2", "retrieval/mount-library"]
)
def test_library_outside_the_mount_tree_is_accepted(
    tmp_path: Path, library: str
) -> None:
    (tmp_path / library).mkdir(parents=True)
    reject_media_root(tmp_path / "retrieval/mount", str(tmp_path / library))


@pytest.mark.parametrize("name", ["medai-typo", "media ", "media/file.mkv"])
def test_library_that_is_not_an_existing_directory_is_refused(
    tmp_path: Path, name: str
) -> None:
    (tmp_path / "media").mkdir()
    (tmp_path / "media/file.mkv").write_bytes(b"")
    with pytest.raises(Refusal, match="media_root_not_a_directory"):
        reject_media_root(tmp_path / "retrieval/mount", str(tmp_path / name))


@pytest.mark.parametrize(
    "library",
    [
        "/srv/retrieval/mount",
        "/srv/retrieval/mount/",
        "/srv/retrieval/mount/films",
        "/srv/retrieval",
        "/",
        "/srv/retrieval/other/../mount",
    ],
)
def test_library_sharing_the_mount_tree_is_refused(library: str) -> None:
    with pytest.raises(Refusal, match="storage_inside_media_root"):
        reject_media_root(Path("/srv/retrieval/mount"), library)


def test_library_symlinked_into_the_mount_is_refused(tmp_path: Path) -> None:
    mount = tmp_path / "mount"
    (mount / "films").mkdir(parents=True)
    alias = tmp_path / "library"
    alias.symlink_to(mount / "films")
    with pytest.raises(Refusal, match="storage_inside_media_root"):
        reject_media_root(mount, str(alias))
