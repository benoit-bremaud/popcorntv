#!/usr/bin/env python3
"""Opt-in, bounded NordVPN namespace experiment; never prints configuration or public IPs."""

import argparse
import base64
import configparser
from datetime import datetime, timezone
import io
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.parse

VPN_IMAGE = "qmcgaw/gluetun@sha256:cbafe0945d0fe5a3c55ca64d43a85c5db270458f4c645ee65797b527f6f57a64"
PROBE_IMAGE = "lscr.io/linuxserver/qbittorrent:5.3.0_v2.1.2-ls487@sha256:3d4c4545d51a690a0df15a2ff99038823a88a9822df8e794526447b9afbd7384"
DEBUG = False


def log_event(event, level="info", **fields):
    """Write a UTC JSON lifecycle event to stderr, separate from the final result.

    Callers must pass safe categorical fields, never secrets, addresses or raw tool output.
    Debug events are suppressed unless the CLI enabled DEBUG; writes are flushed immediately.
    """
    if level == "debug" and not DEBUG:
        return
    print(
        json.dumps(
            {
                "time": datetime.now(timezone.utc).isoformat(),
                "event": event,
                "level": level,
                **fields,
            }
        ),
        file=sys.stderr,
        flush=True,
    )


def command(args, data=None, timeout=30, required=True):
    """Run a bounded subprocess with optional secret stdin and captured output.

    Return CompletedProcess, or raise RuntimeError on a required nonzero exit. TimeoutExpired
    propagates after a safe diagnostic. Never log arguments or captured output: curl's stdin
    carries passwords, control API keys and session cookies.
    """
    operation = (
        args[1]
        if len(args) > 1
        and args[1] in {"create", "start", "exec", "inspect", "logs", "rm"}
        else "other"
    )
    began = time.monotonic()
    log_event("vpn.command_started", level="debug", operation=operation)
    try:
        result = subprocess.run(
            args, input=data, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        log_event(
            "vpn.command_timeout",
            level="error",
            operation=operation,
            elapsedMs=round((time.monotonic() - began) * 1000),
        )
        raise
    log_event(
        "vpn.command_completed",
        level="debug",
        operation=operation,
        returnCode=result.returncode,
        elapsedMs=round((time.monotonic() - began) * 1000),
    )
    if required and result.returncode:
        # Do not log argv, stdin, stdout or stderr: curl configs carry credentials.
        log_event(
            "vpn.command_failed",
            level="error",
            operation=operation,
            returnCode=result.returncode,
        )
        raise RuntimeError("experiment_command_failed")
    return result


def prepare_config(path):
    """Return adapted INI text from a private local WireGuard file without changing it.

    Reject unsupported fields, malformed keys/routes and non-public endpoints. Resolve the
    supplied endpoint to IPv4 because Gluetun's custom provider requires a numeric address;
    omit source DNS so Gluetun owns resolution. ValueError/INI/DNS errors propagate and must
    never be printed verbatim because they can contain source values. The return is secret.
    """
    path = Path(path)
    if not path.is_file() or path.stat().st_mode & 0o077 or path.stat().st_size > 16384:
        raise ValueError("configuration_requires_private_regular_file")
    config = configparser.ConfigParser()
    config.optionxform = str
    config.read_string(path.read_text())
    allowed = {
        "Interface": {"PrivateKey", "Address", "DNS"},
        "Peer": {"PublicKey", "AllowedIPs", "Endpoint", "PersistentKeepalive"},
    }
    if set(config.sections()) != set(allowed):
        raise ValueError("unsupported_configuration_section")
    for section, fields in allowed.items():
        if not set(config[section]).issubset(fields):
            raise ValueError("unsupported_configuration_field")
    for section, key in [("Interface", "PrivateKey"), ("Peer", "PublicKey")]:
        if len(base64.b64decode(config[section][key], validate=True)) != 32:
            raise ValueError("invalid_wireguard_key")
    for value in config["Interface"]["Address"].split(","):
        ipaddress.ip_interface(value.strip())
    routes = {
        ipaddress.ip_network(v.strip()) for v in config["Peer"]["AllowedIPs"].split(",")
    }
    if ipaddress.ip_network("0.0.0.0/0") not in routes:
        raise ValueError("full_ipv4_tunnel_required")
    host, port = config["Peer"]["Endpoint"].rsplit(":", 1)
    if not 1 <= int(port) <= 65535:
        raise ValueError("invalid_endpoint_port")
    address = socket.getaddrinfo(host, int(port), socket.AF_INET, socket.SOCK_DGRAM)[0][
        4
    ][0]
    if not ipaddress.ip_address(address).is_global:
        raise ValueError("public_endpoint_required")
    config["Peer"]["Endpoint"] = f"{address}:{port}"
    # Gluetun owns DNS; avoid importing an independent resolver route from the source.
    config.remove_option("Interface", "DNS")
    output = io.StringIO()
    config.write(output)
    return output.getvalue()


def run(path):
    """Exercise a real tunnel and idle client using only initializer-owned temporary resources.

    Args:
        path: Private WireGuard file, read only; never mounted directly into the client.

    Returns:
        Secret-free observations of egress, DNS, controlled stop and recovery.

    Raises:
        RuntimeError: A prerequisite, safety assertion or cleanup failed.
        OSError: File, Docker transport or endpoint resolution failed.
        ValueError: The configuration or an external response is invalid.

    This contacts public HTTPS/DNS probes but adds no torrent. Host routes are not modified.
    Containers are removed in reverse creation order on both success and failure. This is
    a controlled-stop experiment, not proof against process crash or packet blackholing.
    """
    began = time.monotonic()
    log_event("vpn.experiment_started")
    with urllib.request.urlopen(
        "https://1.1.1.1/cdn-cgi/trace", timeout=10
    ) as response:
        host_fields = dict(
            line.split("=", 1)
            for line in response.read(16384).decode().splitlines()
            if "=" in line
        )
    host_ip = ipaddress.ip_address(host_fields["ip"])
    prefix = "popcorntv-vpn-spike-" + secrets.token_hex(5)
    vpn, probe = prefix + "-vpn", prefix + "-probe"
    created = []
    with tempfile.TemporaryDirectory(prefix="popcorntv-vpn-secret-") as root:
        root = Path(root)
        config = root / "wg0.conf"
        config.write_text(prepare_config(path))
        config.chmod(0o600)
        log_event("vpn.configuration_validated")
        key = secrets.token_hex(24)
        auth = root / "auth.toml"
        auth.write_text(
            '[[roles]]\nname="spike"\nroutes=["PUT /v1/vpn/status"]\nauth="apikey"\napikey="'
            + key
            + '"\n'
        )
        auth.chmod(0o600)
        client_config = root / "client-config"
        (client_config / "qBittorrent").mkdir(parents=True)
        client_data = root / "client-data"
        client_data.mkdir()
        password = secrets.token_hex(24)
        salt = secrets.token_bytes(16)
        password_hash = (
            base64.b64encode(salt).decode()
            + ":"
            + base64.b64encode(
                hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100000, 64)
            ).decode()
        )
        client_file = client_config / "qBittorrent" / "qBittorrent.conf"
        client_file.write_text(
            '[LegalNotice]\nAccepted=true\n[BitTorrent]\nSession\\DHTEnabled=false\nSession\\PeXEnabled=false\nSession\\LSDEnabled=false\nSession\\Port=6881\nSession\\DefaultSavePath=/data/\n[Preferences]\nConnection\\UPnP=false\nGeneral\\CheckForUpdates=false\nWebUI\\Username=spike\nWebUI\\Password_PBKDF2="@ByteArray('
            + password_hash
            + ')"\nWebUI\\LocalHostAuth=true\nWebUI\\CSRFProtection=true\nWebUI\\HostHeaderValidation=true\n'
        )
        client_file.chmod(0o600)
        try:
            # Network appliance needs NET_ADMIN; DAC_OVERRIDE reads UID-owned 0600 bind files.
            # The unprivileged probe receives neither capability nor any credential mount.
            command(
                [
                    "docker",
                    "create",
                    "--name",
                    vpn,
                    "--log-driver=json-file",
                    "--log-opt=max-size=2m",
                    "--log-opt=max-file=1",
                    "--read-only",
                    "--cap-drop=ALL",
                    "--cap-add=NET_ADMIN",
                    "--cap-add=DAC_OVERRIDE",
                    "--security-opt=no-new-privileges:true",
                    "--pids-limit=128",
                    "--memory=256m",
                    "--cpus=1",
                    "--tmpfs",
                    f"/tmp:rw,nosuid,nodev,size=32m,uid={os.getuid()},gid={os.getgid()}",
                    "--tmpfs",
                    f"/gluetun:rw,nosuid,nodev,size=16m,uid={os.getuid()},gid={os.getgid()}",
                    "--sysctl",
                    "net.ipv6.conf.all.disable_ipv6=1",
                    "--tmpfs",
                    "/run:rw,nosuid,nodev,size=4m",
                    "--mount",
                    f"type=bind,src={config},dst=/gluetun/wireguard/wg0.conf,readonly",
                    "--mount",
                    f"type=bind,src={auth},dst=/gluetun/auth/config.toml,readonly",
                    "-e",
                    "VPN_SERVICE_PROVIDER=custom",
                    "-e",
                    "VPN_TYPE=wireguard",
                    "-e",
                    "PUID=0",
                    "-e",
                    "PGID=0",
                    "-e",
                    "WIREGUARD_IMPLEMENTATION=kernelspace",
                    "-e",
                    "VERSION_INFORMATION=off",
                    "-e",
                    "PUBLICIP_ENABLED=false",
                    "-e",
                    "LOG_LEVEL=error",
                    VPN_IMAGE,
                ]
            )
            created.append(vpn)
            command(["docker", "start", vpn])
            command(
                [
                    "docker",
                    "create",
                    "--name",
                    probe,
                    "--log-driver=json-file",
                    "--log-opt=max-size=2m",
                    "--log-opt=max-file=1",
                    "--network",
                    "container:" + vpn,
                    "--user",
                    f"{os.getuid()}:{os.getgid()}",
                    "--read-only",
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges:true",
                    "--pids-limit=128",
                    "--memory=384m",
                    "--cpus=1",
                    "--tmpfs",
                    f"/tmp:rw,nosuid,nodev,noexec,size=32m,uid={os.getuid()},gid={os.getgid()}",
                    "--tmpfs",
                    f"/run:rw,nosuid,nodev,exec,size=16m,uid={os.getuid()},gid={os.getgid()}",
                    "--mount",
                    f"type=bind,src={client_config},dst=/config",
                    "--mount",
                    f"type=bind,src={client_data},dst=/data",
                    "-e",
                    "S6_READ_ONLY_ROOT=1",
                    "-e",
                    "WEBUI_PORT=8080",
                    "-e",
                    "TORRENTING_PORT=6881",
                    PROBE_IMAGE,
                ]
            )
            created.append(probe)
            command(["docker", "start", probe])
            log_event("vpn.containers_started")

            def curl(url, extra=(), required=False):
                return command(
                    [
                        "docker",
                        "exec",
                        "-i",
                        probe,
                        "curl",
                        "--silent",
                        "--fail",
                        "--connect-timeout",
                        "3",
                        "--max-time",
                        "6",
                        *extra,
                        url,
                    ],
                    required=required,
                )

            def trace():
                response = curl("https://1.1.1.1/cdn-cgi/trace")
                if response.returncode:
                    return None
                fields = dict(
                    line.split("=", 1)
                    for line in response.stdout.splitlines()
                    if "=" in line
                )
                return fields.get("ip")

            def wait_connected():
                for _ in range(20):
                    address = trace()
                    if address:
                        return address
                    state = command(
                        ["docker", "inspect", "--format", "{{.State.Running}}", vpn]
                    ).stdout.strip()
                    if state != "true":
                        raise RuntimeError("vpn_exited_before_connection")
                    time.sleep(1)
                raise RuntimeError("vpn_connection_timeout")

            first = wait_connected()
            if ipaddress.ip_address(first) == host_ip:
                raise RuntimeError("vpn_egress_matches_host")
            log_event(
                "vpn.egress_verified",
                elapsedMs=round((time.monotonic() - began) * 1000),
            )
            for _ in range(20):
                client = command(
                    ["docker", "exec", probe, "pgrep", "-x", "qbittorrent-nox"],
                    required=False,
                )
                if client.returncode == 0:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("download_client_not_running")
            login_config = (
                'url = "http://127.0.0.1:8080/api/v2/auth/login"\nheader = "Referer: http://127.0.0.1:8080/"\ndata = "'
                + urllib.parse.urlencode({"username": "spike", "password": password})
                + '"\nsilent\nfail\ndump-header = "-"\nmax-time = 5\n'
            )
            for _ in range(20):
                login = command(
                    ["docker", "exec", "-i", probe, "curl", "--config", "-"],
                    data=login_config,
                    required=False,
                )
                cookie = re.search(
                    r"set-cookie:\s*((?:SID|QBT_SID_\d+)=[^;\r\n]+)", login.stdout, re.I
                )
                if login.returncode == 0 and cookie:
                    break
                time.sleep(1)
            else:
                raise RuntimeError("client_authenticated_api_unavailable")
            api_config = (
                'url = "http://127.0.0.1:8080/api/v2/app/preferences"\ncookie = "'
                + cookie.group(1)
                + '"\nsilent\nfail\nmax-time = 5\n'
            )
            preferences = json.loads(
                command(
                    ["docker", "exec", "-i", probe, "curl", "--config", "-"],
                    data=api_config,
                ).stdout
            )
            if any(
                preferences.get(field) is not False
                for field in ["dht", "pex", "lsd", "upnp"]
            ):
                raise RuntimeError("client_discovery_not_disabled")
            log_event("vpn.client_authenticated_and_isolated")
            named = curl("https://www.cloudflare.com/cdn-cgi/trace")
            if named.returncode:
                raise RuntimeError("tunnel_dns_failed")
            direct_dns = command(
                ["docker", "exec", vpn, "nslookup", "example.com", "1.1.1.1"],
                timeout=20,
                required=False,
            )
            if direct_dns.returncode:
                raise RuntimeError("direct_dns_probe_has_no_connected_baseline")
            log_event("vpn.dns_verified")

            def control(status):
                request = (
                    'header = "X-API-Key: '
                    + key
                    + '"\nheader = "Content-Type: application/json"\nrequest = "PUT"\ndata = "{\\"status\\":\\"'
                    + status
                    + '\\"}"\n'
                )
                command(
                    [
                        "docker",
                        "exec",
                        "-i",
                        probe,
                        "curl",
                        "--silent",
                        "--fail",
                        "--max-time",
                        "5",
                        "--config",
                        "-",
                        "http://127.0.0.1:8000/v1/vpn/status",
                    ],
                    data=request,
                )

            control("stopped")
            log_event("vpn.tunnel_stop_requested")
            time.sleep(2)
            blocked = all(trace() is None for _ in range(3))
            ipv6_blocked = (
                curl("https://[2606:4700:4700::1111]/cdn-cgi/trace", ("-6",)).returncode
                != 0
            )
            dns_blocked = (
                command(
                    ["docker", "exec", vpn, "nslookup", "example.com", "1.1.1.1"],
                    timeout=20,
                    required=False,
                ).returncode
                != 0
            )
            if not all([blocked, ipv6_blocked, dns_blocked]):
                raise RuntimeError("tunnel_stop_did_not_block_all_probes")
            log_event("vpn.stopped_traffic_blocked")
            control("running")
            recovered = wait_connected()
            log_event(
                "vpn.reconnected", elapsedMs=round((time.monotonic() - began) * 1000)
            )
            return {
                "stage": "NordVPN namespace probe",
                "vpnImage": VPN_IMAGE,
                "connected": bool(first),
                "downloadClientRunning": True,
                "clientDiscoveryDisabled": True,
                "egressDiffersFromHost": True,
                "dnsWorked": True,
                "stoppedIpv4Blocked": blocked,
                "stoppedIpv6Blocked": ipv6_blocked,
                "stoppedDirectDnsBlocked": dns_blocked,
                "reconnected": bool(recovered),
                "limits": [
                    "No torrent or application playback",
                    "Controlled tunnel stop, not packet loss or container restart",
                    "IPv6 disabled, not tunneled",
                ],
            }
        except RuntimeError as error:
            log_event("vpn.experiment_failed", code=str(error))
            logs = command(["docker", "logs", vpn], required=False)
            diagnostic = logs.stdout + logs.stderr
            permission_lines = []
            for line in diagnostic.splitlines():
                if any(
                    marker in line.lower()
                    for marker in [
                        "permitted",
                        "permission denied",
                        "read-only file system",
                        "error",
                    ]
                ):
                    line = line.replace(key, "[redacted]")
                    line = re.sub(r"[A-Za-z0-9+/=_-]{24,}", "[redacted]", line)
                    line = re.sub(r"(?:\d{1,3}\.){3}\d{1,3}", "[ip]", line)
                    permission_lines.append(line[:300])
            print(
                json.dumps(
                    {
                        "failureCode": str(error),
                        "diagnostics": {
                            "tunMentioned": "/dev/net/tun" in diagnostic,
                            "permissionDenied": "operation not permitted"
                            in diagnostic.lower()
                            or "permission denied" in diagnostic.lower(),
                            "readOnlyFailure": "read-only file system"
                            in diagnostic.lower(),
                            "configurationError": "reading settings"
                            in diagnostic.lower(),
                            "subsystems": [
                                word
                                for word in [
                                    "chown",
                                    "ownership",
                                    "setuid",
                                    "setgid",
                                    "iptables",
                                    "firewall",
                                    "netlink",
                                    "chmod",
                                    "user",
                                    "group",
                                    "mknod",
                                ]
                                if word in diagnostic.lower()
                            ],
                            "permissionErrors": permission_lines,
                        },
                    }
                )
            )
            raise
        finally:
            cleanup_failed = False
            for name in reversed(created):
                cleanup_failed |= (
                    command(["docker", "rm", "-f", name], required=False).returncode
                    != 0
                )
            if cleanup_failed:
                log_event("vpn.cleanup_failed")
                raise RuntimeError("experiment_cleanup_failed")
            log_event(
                "vpn.cleanup_completed",
                elapsedMs=round((time.monotonic() - began) * 1000),
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--config")
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Log command timing/status without arguments or outputs",
    )
    args = parser.parse_args()
    DEBUG = args.debug
    if not args.run or not args.config:
        parser.error("explicit --run and --config required")
    try:
        print(json.dumps(run(args.config), indent=2))
    except Exception as error:
        # Never echo exception text: INI/base64/network errors can include credential values.
        print(json.dumps({"verdict": "FAILED", "errorType": type(error).__name__}))
        raise SystemExit(1) from None
