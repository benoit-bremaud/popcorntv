#!/bin/sh
# Start only the verified Pi staging project against the local Docker daemon.
set -eu

if [ "${PCTV_STAGE_HOST:-}" != 'popcorntv-staging.bb-homelab.local' ]; then
    printf '%s\n' 'pi-staging.ingress_refused:stage_host_invalid' >&2
    exit 1
fi

stage_dir=$(CDPATH='' cd -P "$(dirname "$0")" && pwd)
unset DOCKER_CONTEXT DOCKER_HOST
sh "$stage_dir/check-storage.sh"
if ! cmp -s -- "$stage_dir/Caddyfile" /mnt/appdata/popcorntv-staging/Caddyfile; then
    printf '%s\n' 'pi-staging.ingress_refused:caddyfile_mismatch' >&2
    exit 1
fi

python3 - "${PCTV_STAGE_TAILNET_IP:-}" <<'PY'
import ipaddress
import json
import os
import re
import subprocess
import sys


def output(*command):
    return subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL, timeout=10)


try:
    requested = ipaddress.IPv4Address(sys.argv[1])
    if requested not in ipaddress.IPv4Network("100.64.0.0/10"):
        raise ValueError("address outside Tailnet range")
    reported = ipaddress.IPv4Address(output("tailscale", "ip", "-4").strip())
    interfaces = json.loads(output("ip", "-j", "-4", "addr", "show", "dev", "tailscale0"))
    assigned = {info["local"] for interface in interfaces for info in interface["addr_info"]}
    if requested != reported or str(requested) not in assigned:
        raise ValueError("address not assigned to this Pi")
except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
    sys.exit("pi-staging.ingress_refused:tailnet_ipv4_unconfirmed")

image_format = (
    '{"id":{{json .Id}},"os":{{json .Os}},'
    '"architecture":{{json .Architecture}},"digests":{{json .RepoDigests}}}'
)
for role, key in (("app", "PCTV_STAGE_IMAGE"), ("caddy", "PCTV_STAGE_CADDY_IMAGE")):
    reference = os.environ.get(key, "")
    if not re.fullmatch(r"(?:[a-z0-9][a-z0-9./:_-]*@)?sha256:[a-f0-9]{64}", reference):
        sys.exit(f"pi-staging.image_refused:{role}_immutable_reference_required")
    try:
        observed = json.loads(output(
            "docker", "--host", "unix:///var/run/docker.sock",
            "image", "inspect", "--format", image_format, reference,
        ))
        if observed["os"] != "linux" or observed["architecture"] != "arm64":
            raise ValueError("unexpected image platform")
        if "@" in reference:
            digests = observed["digests"]
            matched = isinstance(digests, list) and reference in digests
        else:
            matched = reference == observed["id"]
        if not matched:
            raise ValueError("unexpected image identity")
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        sys.exit(f"pi-staging.image_refused:{role}_identity_unconfirmed")
PY

exec docker --host unix:///var/run/docker.sock compose \
    --project-name popcorntv-pi-staging --env-file /dev/null \
    -f "$stage_dir/compose.yml" up -d --wait
