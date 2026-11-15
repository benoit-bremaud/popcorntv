"""Exercise actual pinned images in disposable private state; required by the L2 gate."""

from __future__ import annotations

import copy
import json
import logging
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import replace
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
            if (
                discovery.object_map(discovery.object_map(row["Config"])["Labels"])[
                    "com.docker.compose.service"
                ]
                == "ingress"
            ):
                continue
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


def verify_limits(
    installation: discovery.Installation, *, published: bool = False
) -> None:
    """Inspect effective constraints and PID 1 identity rather than Compose intentions."""
    rows = discovery.owned_containers(installation)
    assert len(rows) == 3
    for row in rows:
        config, host = (
            discovery.object_map(row["Config"]),
            discovery.object_map(row["HostConfig"]),
        )
        service = discovery.object_map(config["Labels"])["com.docker.compose.service"]
        assert config["User"] == f"{installation.uid}:{installation.gid}"
        ingress = service == "ingress"
        assert host["ReadonlyRootfs"] is True
        assert host["NanoCpus"] == (250_000_000 if ingress else 1_000_000_000)
        assert (
            host["Memory"]
            == (96 if ingress else 256 if service == "prowlarr" else 512) * 1024 * 1024
        )
        assert host["PidsLimit"] == (64 if ingress else 128)
        if not ingress or not published:
            assert not host["PortBindings"]
        assert host["Dns"] == ["127.0.0.1"]
        mounts = discovery.object_map(host["Tmpfs"])
        expected = (
            [
                ("/tmp", "0700", "8m", "noexec"),
                ("/data", "0700", "8m", "noexec"),
                ("/config", "0700", "8m", "noexec"),
            ]
            if ingress
            else [("/tmp", "0700", "32m", "noexec"), ("/run", "0755", "16m", "exec")]
        )
        for destination, mode, size, execution in expected:
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


def provider_request(
    api: discovery.Api, path: str, *, payload: object = None
) -> object:
    """Exercise the disposable Prowlarr API; schema metadata has a separate 8 MiB budget."""
    request = urllib.request.Request(
        api.base + "/api/v1/" + path,
        data=None if payload is None else json.dumps(payload).encode(),
        method="GET" if payload is None else "POST",
        headers={
            "X-Api-Key": api.credential.api_key,
            "Content-Type": "application/json",
        },
    )
    try:
        with api.opener.open(request, timeout=20) as response:
            body = response.read(8 * 1024 * 1024 + 1)
            assert len(body) <= 8 * 1024 * 1024
            result: object = json.loads(body)
            return result
    except urllib.error.HTTPError as error:
        status = error.code
        error.close()
        raise discovery.DiscoveryError(
            f"synthetic provider request failed: HTTP {status}"
        ) from None


def provider_rows(value: object) -> list[dict[str, object]]:
    """Narrow controlled schema/search replies without leaking payloads in diagnostics."""
    assert isinstance(value, list)
    return [discovery.object_map(row) for row in value]


def verify_synthetic_sources(installation: discovery.Installation) -> None:
    """Create two local-only sources, then prove a fresh result survives one outage."""
    api = discovery.Api(installation, discovery.SERVICES[0])
    schema = next(
        row
        for row in provider_rows(provider_request(api, "indexer/schema"))
        if row.get("implementation") == "Torznab"
    )
    identifiers: list[str] = []
    indexers: list[int] = []
    urls: list[str] = []
    try:
        for number in (4, 5):
            address = str(installation.subnet[number])
            url = f"http://{address}:19090"
            urls.append(url)
            identifier = discovery.command(
                [
                    "docker",
                    "run",
                    "-d",
                    "--label",
                    "io.popcorntv.acceptance=" + installation.identity,
                    "--network",
                    installation.project + "_discovery",
                    "--ip",
                    address,
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
                    str(discovery.ROOT / "deploy/local-discovery/fixtures/torznab.mjs")
                    + ":/fixture.mjs:ro",
                    "--entrypoint",
                    "node",
                    CANARY_IMAGE,
                    "/fixture.mjs",
                    str(number),
                    address,
                ]
            ).strip()
            identifiers.append(identifier)
            for _attempt in range(50):
                try:
                    counters(url)
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                pytest.fail("synthetic source did not become ready")
            settings = copy.deepcopy(schema)
            settings.pop("id", None)
            settings.update(
                {
                    "name": f"Local synthetic {number}",
                    "enable": True,
                    "appProfileId": 1,
                    "priority": 25,
                }
            )
            fields = settings["fields"]
            assert isinstance(fields, list)
            values = {
                "baseUrl": url,
                "apiPath": "/api",
                "apiKey": "synthetic-not-a-real-provider-key",
            }
            for value in fields:
                field = discovery.object_map(value)
                name = field.get("name")
                if isinstance(name, str) and name in values:
                    field["value"] = values[name]
            created = discovery.object_map(
                provider_request(api, "indexer", payload=settings)
            )
            identity = created["id"]
            assert isinstance(identity, int)
            indexers.append(identity)
        before = [counters(url) for url in urls]
        query = urllib.parse.urlencode(
            {"query": "Fixture healthy", "type": "search", "indexerIds": indexers},
            doseq=True,
        )
        results = provider_rows(provider_request(api, "search?" + query))
        assert {row["indexerId"] for row in results} == set(indexers)
        for url, prior in zip(urls, before, strict=True):
            assert count(counters(url), "searches") > count(prior, "searches")
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        request = urllib.request.Request(urls[0] + "/fail", data=b"", method="POST")
        with opener.open(request, timeout=2) as response:
            assert response.status == 200
        assert counters(urls[0])["unavailable"] is True
        before_failed = counters(urls[0])
        before_healthy = counters(urls[1])
        query = urllib.parse.urlencode(
            {"query": "Fixture outage", "type": "search", "indexerIds": indexers},
            doseq=True,
        )
        results = provider_rows(provider_request(api, "search?" + query))
        assert {row["indexerId"] for row in results} == {indexers[1]}
        assert count(counters(urls[0]), "attempts") > count(before_failed, "attempts")
        assert count(counters(urls[1]), "searches") > count(before_healthy, "searches")
        for url in urls:
            with pytest.raises(urllib.error.HTTPError) as failure:
                opener.open(url + "/no-payload", timeout=2)
            assert failure.value.code == 410
            failure.value.close()
    finally:
        primary = sys.exception()
        for identifier in identifiers:
            try:
                row = inspect_one(identifier)
                labels = discovery.object_map(
                    discovery.object_map(row["Config"])["Labels"]
                )
                assert labels.get("io.popcorntv.acceptance") == installation.identity
                discovery.command(["docker", "rm", "-f", identifier])
            except BaseException:
                logging.getLogger(__name__).error(
                    "synthetic source cleanup unconfirmed: %s", identifier
                )
                if primary is None:
                    raise


def test_real_private_bootstrap_restart_and_network_isolation() -> None:
    """Run the required real-image journey, preserving failed state if cleanup fails."""
    root = Path(tempfile.mkdtemp(prefix="popcorntv-discovery-acceptance-"))
    installation: discovery.Installation | None = None
    try:
        installation = replace(
            discovery.initialize(root / "state"),
            published_ports={"prowlarr": 0, "radarr": 0},
        )
        private = {
            path: path.read_bytes()
            for path in installation.root.glob("*-credentials.json")
        }
        # Observe first listen before account provisioning, then a real rejected setup request.
        discovery.prepare_ingress(installation)
        radarr_image, ingress_image = discovery.verify_images(installation)
        discovery.compose(
            installation,
            ["up", "-d", "--wait", "--wait-timeout", "120"],
            radarr_image=radarr_image,
            ingress_image=ingress_image,
        )
        discovery.verify_initialization_denial(installation)
        for service in discovery.SERVICES:
            api = discovery.Api(installation, service)
            host = discovery.object_map(api.json("config/host"))
            assert host.get("username") in (None, "")
            api.credential = replace(api.credential, api_key="0" * 32)
            with pytest.raises(discovery.DiscoveryError):
                discovery.configure(api)
        discovery.verify_withdrawal(installation)
        discovery.start(installation, publish=False)
        verify_limits(installation)
        discovery.start(installation, publish=True)
        verify_limits(installation, published=True)
        verify_isolation(installation)
        discovery.compose(installation, ["stop"])
        discovery.start(installation, publish=True)
        verify_limits(installation, published=True)
        if any(path.read_bytes() != value for path, value in private.items()):
            pytest.fail("private credentials changed across restart")
        for service in discovery.SERVICES:
            api = discovery.Api(installation, service)
            discovery.verify_configuration(api)
            assert api.request(
                "/", authenticated=False, cookie="invalid=fixture"
            ).status in (302, 401, 403)
        verify_synthetic_sources(installation)
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
