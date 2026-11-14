"""Exercise actual pinned images in disposable private state; required by the L2 gate."""

from __future__ import annotations

import json
import logging
import shutil
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import local_discovery as discovery
import pytest

CANARY_IMAGE = "node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6"


def inspect_one(identifier: str) -> dict[str, object]:
    """Read one known container's actual metadata without printing configuration."""
    value: object = json.loads(discovery.command(["docker", "inspect", identifier]))
    assert isinstance(value, list) and len(value) == 1
    return discovery.object_map(value[0])


def counters(address: str) -> dict[str, object]:
    """Read only non-sensitive counters from the explicit local canary address."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(address + "/stats", timeout=2) as response:
        value: object = json.loads(response.read(1024))
    return discovery.object_map(value)


def count(values: dict[str, object], key: str) -> int:
    """Require a numeric counter so a malformed positive control cannot pass."""
    value = values[key]
    assert isinstance(value, int)
    return value


def verify_isolation(installation: discovery.Installation) -> None:
    """Prove TCP/DNS denial between successful contemporaneous positive controls."""
    fixture = discovery.ROOT / "deploy/local-discovery/fixtures/probe.mjs"
    label = "io.popcorntv.acceptance"
    identifier = discovery.command(
        [
            "docker",
            "run",
            "-d",
            "--label",
            label + "=" + installation.identity,
            "--network",
            "bridge",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            f"{installation.uid}:{installation.gid}",
            "--memory",
            "64m",
            "--pids-limit",
            "32",
            "-v",
            str(fixture) + ":/probe.mjs:ro",
            "--entrypoint",
            "node",
            CANARY_IMAGE,
            "/probe.mjs",
        ]
    ).strip()
    try:
        canary = inspect_one(identifier)
        networks = discovery.object_map(
            discovery.object_map(canary["NetworkSettings"])["Networks"]
        )
        address = str(discovery.object_map(networks["bridge"])["IPAddress"])
        url = f"http://{address}:18080"
        for _attempt in range(50):
            try:
                counters(url)
                break
            except OSError:
                time.sleep(0.1)
        else:
            pytest.fail("local network canary did not become ready")
        for row in discovery.owned_containers(installation):
            identity, image = str(row["Id"]), str(row["Image"])
            commands = [
                (
                    "http",
                    [
                        "curl",
                        "--noproxy",
                        "*",
                        "--fail",
                        "--silent",
                        "--connect-timeout",
                        "1",
                        "--max-time",
                        "2",
                        url + "/health",
                    ],
                ),
                (
                    "dns",
                    [
                        "timeout",
                        "5",
                        "busybox",
                        "nslookup",
                        "-type=A",
                        "-port=5353",
                        "fixture.test",
                        address,
                    ],
                ),
            ]
            for counter, command in commands:
                positive = [
                    "docker",
                    "run",
                    "--rm",
                    "--network",
                    "bridge",
                    "--read-only",
                    "--user",
                    f"{installation.uid}:{installation.gid}",
                    "--cap-drop",
                    "ALL",
                    "--security-opt",
                    "no-new-privileges",
                    "--entrypoint",
                    command[0],
                    image,
                    *command[1:],
                ]
                before = counters(url)
                discovery.command(positive)
                after = counters(url)
                assert isinstance(before[counter], int) and isinstance(
                    after[counter], int
                )
                assert count(after, counter) > count(before, counter)
                with pytest.raises(discovery.DiscoveryError):
                    discovery.command(["docker", "exec", identity, *command])
                assert counters(url) == after
                discovery.command(positive)
                final = counters(url)
                assert isinstance(final[counter], int)
                assert count(final, counter) > count(after, counter)
            state = discovery.object_map(inspect_one(identity)["State"])
            assert discovery.object_map(state["Health"])["Status"] == "healthy"
    finally:
        primary = sys.exception()
        try:
            labels = discovery.object_map(
                discovery.object_map(inspect_one(identifier)["Config"])["Labels"]
            )
            assert labels.get(label) == installation.identity
            discovery.command(["docker", "rm", "-f", identifier])
        except BaseException:
            logging.getLogger(__name__).error(
                "canary cleanup unconfirmed; reconcile container %s", identifier
            )
            if primary is None:
                raise


def verify_limits(installation: discovery.Installation) -> None:
    """Inspect effective constraints and PID 1 identity rather than Compose intentions."""
    rows = discovery.owned_containers(installation)
    assert len(rows) == 2
    for row in rows:
        config, host = (
            discovery.object_map(row["Config"]),
            discovery.object_map(row["HostConfig"]),
        )
        service = discovery.object_map(config["Labels"])["com.docker.compose.service"]
        assert config["User"] == f"{installation.uid}:{installation.gid}"
        assert host["ReadonlyRootfs"] is True and host["NanoCpus"] == 1_000_000_000
        assert host["Memory"] == (256 if service == "prowlarr" else 512) * 1024 * 1024
        assert host["PidsLimit"] == 128 and not host["PortBindings"]
        assert host["Dns"] == ["127.0.0.1"]
        mounts = discovery.object_map(host["Tmpfs"])
        for destination, mode, size, execution in (
            ("/tmp", "0700", "32m", "noexec"),
            ("/run", "0755", "16m", "exec"),
        ):
            options = str(mounts[destination]).split(",")
            assert {
                f"uid={installation.uid}",
                f"gid={installation.gid}",
                f"mode={mode}",
                f"size={size}",
                execution,
                "nosuid",
                "nodev",
            }.issubset(options)
        logs = discovery.object_map(host["LogConfig"])
        assert logs["Type"] == "json-file"
        assert logs["Config"] == {"max-size": "2m", "max-file": "3"}
        state = discovery.object_map(row["State"])
        assert state["OOMKilled"] is False
        assert discovery.object_map(state["Health"])["Status"] == "healthy"
        status = discovery.command(
            ["docker", "exec", str(row["Id"]), "cat", "/proc/1/status"]
        )
        values = {
            line.split(":", 1)[0]: line.split(":", 1)[1].strip()
            for line in status.splitlines()
            if ":" in line
        }
        assert set(values["Uid"].split()) == {str(installation.uid)}
        assert int(values["CapEff"], 16) == 0 and int(values["CapBnd"], 16) == 0
        assert values["NoNewPrivs"] == "1"


def test_real_private_bootstrap_restart_and_network_isolation() -> None:
    """Run the required real-image journey, preserving failed state if cleanup fails."""
    root = Path(tempfile.mkdtemp(prefix="popcorntv-discovery-acceptance-"))
    installation: discovery.Installation | None = None
    try:
        installation = discovery.initialize(root / "state")
        private = {
            path: path.read_bytes()
            for path in installation.root.glob("*-credentials.json")
        }
        discovery.start(installation, publish=False)
        verify_limits(installation)
        verify_isolation(installation)
        discovery.compose(installation, ["stop"])
        discovery.start(installation, publish=False)
        verify_limits(installation)
        if any(path.read_bytes() != value for path, value in private.items()):
            pytest.fail("private credentials changed across restart")
        for service in discovery.SERVICES:
            api = discovery.Api(installation, service)
            discovery.verify_configuration(api)
            assert api.request(
                "/", authenticated=False, cookie="invalid=fixture"
            ).status in (302, 401, 403)
    finally:
        primary = sys.exception()
        try:
            if installation is not None:
                with discovery.installation_lock(installation):
                    discovery.compose(installation, ["down", "--remove-orphans"])
                if discovery.command(
                    [
                        "docker",
                        "ps",
                        "-aq",
                        "--filter",
                        "label=io.popcorntv.acceptance=" + installation.identity,
                    ]
                ).strip():
                    raise discovery.DiscoveryError(
                        "acceptance canary cleanup unconfirmed"
                    )
        except BaseException:
            logging.getLogger(__name__).error(
                "acceptance cleanup failed; private state retained at %s", root
            )
            if primary is None:
                raise
        else:
            shutil.rmtree(root)
