"""Check real Docker inspection semantics without starting a VPN or client process."""

from __future__ import annotations

import json
import os
import secrets
import subprocess
from pathlib import Path

import local_retrieval as runtime
import pytest
from retrieval_config import Refusal, write_private


@pytest.mark.parametrize("role", ["gluetun", "client"])
def test_never_started_container_preserves_declared_filesystem_and_execution_policy(
    tmp_path: Path, role: str
) -> None:
    """Create/inspect/remove only our returned ID; use no network or real private input."""
    root = tmp_path / "retrieval"
    root.mkdir(mode=0o700)
    write_private(root / "installation.json", json.dumps({"subnet": "172.30.200.0/24"}))
    for name in ("config", "downloads"):
        (root / name).mkdir(mode=0o700)
    write_private(root / "wg0.conf", "fixture-only-never-used-by-a-running-process")
    write_private(root / "resolv.conf", "nameserver 127.0.0.1\n")
    model = json.loads(json.dumps(runtime.compose_model(root, "a" * 16)))
    expected = model["services"][role]
    args = [
        "docker",
        "create",
        "--pull=never",
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--user",
        expected["user"],
        "--entrypoint",
        expected["entrypoint"][0],
        "--log-driver",
        expected["logging"]["driver"],
    ]
    for key, value in expected["logging"]["options"].items():
        args.extend(["--log-opt", key + "=" + value])
    for item in expected["tmpfs"]:
        args.extend(["--tmpfs", item])
    for mount in expected["volumes"]:
        value = "type=bind,src=" + mount["source"] + ",dst=" + mount["target"]
        if mount.get("read_only"):
            value += ",readonly"
        args.extend(["--mount", value])
    args.append(expected["image"])
    created = subprocess.run(
        args, capture_output=True, text=True, check=True, timeout=30
    )
    container_id = created.stdout.strip()
    try:
        observed = json.loads(
            subprocess.check_output(
                ["docker", "inspect", container_id],
                text=True,
                timeout=10,
            )
        )[0]
        assert observed["State"]["Status"] == "created"
        assert observed["State"]["Running"] is False
        assert observed["HostConfig"]["NetworkMode"] == "none"
        runtime.verify_filesystem_policy(observed, expected)
        runtime.verify_execution_policy(observed, expected)
        assert os.stat(root).st_mode & 0o777 == 0o700
    finally:
        subprocess.run(
            ["docker", "rm", "--volumes", container_id],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )


@pytest.mark.parametrize("labels", ["custom-only", "foreign-compose-member"])
def test_real_label_selection_never_broadens_cleanup_to_unproven_containers(
    tmp_path: Path, labels: str
) -> None:
    """Use created-state, networkless fixtures to prove selection against the actual daemon."""
    identity = secrets.token_hex(8)
    project = "pctv-retrieval-" + identity
    root = tmp_path / "retrieval"
    root.mkdir(mode=0o700)
    write_private(
        root / "installation.json",
        json.dumps(
            {
                "version": 2,
                "identity": identity,
                "storage_uuid": "11111111-2222-4333-8444-555555555555",
                "wireguard_sha256": "0" * 64,
                "subnet": "172.30.200.0/24",
            }
        ),
    )
    model = json.loads(json.dumps(runtime.compose_model(root, identity)))
    image = model["services"]["gluetun"]["image"]
    created_ids: list[str] = []
    try:
        for role in ("client", "gluetun"):
            args = [
                "docker",
                "create",
                "--pull=never",
                "--network=none",
                "--read-only",
                "--cap-drop=ALL",
                "--security-opt=no-new-privileges:true",
                "--name",
                project + "-" + role,
            ]
            if labels == "custom-only" or role == "gluetun":
                args.extend(["--label", "org.popcorntv.retrieval=" + identity])
            if labels == "foreign-compose-member":
                args.extend(
                    [
                        "--label",
                        "com.docker.compose.project=" + project,
                        "--label",
                        "com.docker.compose.service=" + role,
                    ]
                )
            args.append(image)
            created_ids.append(
                subprocess.check_output(args, text=True, timeout=30).strip()
            )
        if labels == "custom-only":
            runtime.stop(root, identity)
            observed = json.loads(
                subprocess.check_output(
                    ["docker", "inspect", *created_ids], text=True, timeout=10
                )
            )
            assert all(item["State"]["Running"] is False for item in observed)
            runtime.remove_stopped(root, identity)
            assert not runtime.inspect_owned(identity)
        else:
            with pytest.raises(Refusal, match="container_ownership"):
                runtime.stop(root, identity)
            with pytest.raises(Refusal, match="container_ownership"):
                runtime.remove_stopped(root, identity)
            observed = json.loads(
                subprocess.check_output(
                    ["docker", "inspect", *created_ids], text=True, timeout=10
                )
            )
            assert {item["Id"] for item in observed} == set(created_ids)
            assert all(item["State"]["Status"] == "created" for item in observed)
    finally:
        for identifier in created_ids:
            existing = subprocess.check_output(
                ["docker", "ps", "-aq", "--no-trunc", "--filter", "id=" + identifier],
                text=True,
                timeout=10,
            ).strip()
            if existing == identifier:
                subprocess.run(
                    ["docker", "rm", "--volumes", identifier],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
