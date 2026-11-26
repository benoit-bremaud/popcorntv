# Empty local retrieval behind NordVPN

Operate a private bounded qBittorrent client in Gluetun's WireGuard namespace without enabling acquisition or exposing a host port.

## Scope and tested artifacts

Issue #328, ADR-0035. This is a local empty installation, separate from discovery #327,
the #310 source search, the #311 cache and the browser/player. It is the retrieval egress
of [on-demand retrieval](../../docs/architecture/specs/on-demand-retrieval.md) (REQ-56,
NFR-18). No indexer, media, downloader submission, library mount or automatic startup is
configured. Every command that touches the real VPN file or the real tunnel is run by the
owner, never by an agent (NFR-17).

- qBittorrent: release `5.3.0_v2.1.2-ls487`, manifest
  `sha256:3d4c4545d51a690a0df15a2ff99038823a88a9822df8e794526447b9afbd7384`.
- Gluetun: stable source commit `3d1e20c5551e9cae1f9d938dc7b7214a6987f27e`,
  version `v3.41.3-popcorntv.2` (image tag `popcorntv-gluetun:v3.41.3-pctv.2`). Its checked-in Go manifests patch the vulnerable
  dependencies; Go 1.27.4 and supported Alpine 3.24 are pinned in the Dockerfile.
- Tested local Gluetun Docker image ID:
  `sha256:1d2c6d22e99e230e09e02768736fc4aa985594a148f6ca851f85364f60fce535`.
  Compose uses this immutable local ID, not a floating build tag. A cold rebuild can
  produce another image identity; inspect and scan it, then review an explicit pin
  update before adoption. The `.2` build includes pinned `wg` for read-only F02 peer observation. Do not silently substitute an image or publish a private registry.

The original stable Gluetun image had 41 HIGH matches/37 distinct CVEs. A first rebuilt
runtime still had three HIGH Alpine matches and was refused. The final complete runtime
passed the blocking startup scans. OpenVPN 2.7.7 is retained only because stable Gluetun
unconditionally probes its version under the compatibility name `openvpn2.6`; the alias
reports the actual version. Only kernel WireGuard is configured or qualified.

The image has no embedded VPN secret. Keep private files outside git/build context;
the dedicated Dockerfile ignore list includes only the fixed module manifests.

## Prepare tooling and image

```sh
mise install --locked
mise x -- uv sync --frozen --group ci
mise x -- just retrieval-build
mise x -- just retrieval-check
mise x -- just retrieval-contract
```

Build runs the upstream firewall/settings/WireGuard test packages. It does not use the VPN
file. The Gluetun appliance needs root, NET_ADMIN and DAC_OVERRIDE to read the owner's
0600 bind files; the client is non-root, drops all capabilities and sets no-new-privileges.
All services have read-only roots, bounded tmpfs/CPU/memory/PIDs and rotated logs.
Run initialization and Compose rendering as the ordinary operator, not UID 0;
otherwise the client UID substitution would silently violate its non-root contract.
Root execution is refused before initialization or rendering. The gateway exception
does not extend to the client.
Gluetun's dedicated private resolver file is writable; the client mounts it read-only.
The configured local encrypted DNS forwarder has no Docker/host resolver fallback.

Status verifies the exact bind set and rejects extra volumes, changed tmpfs budgets or
flags, log-policy changes, entrypoint/command overrides and automatic restart. Equivalent
tmpfs size units and option order do not count as drift. Entrypoints are explicit in
Compose and image commands are cleared. `retrieval-contract` creates, inspects and removes
one never-started container per pinned image, with `--network=none`, no pull and only
private disposable dummy inputs. It does not prove connected operation or tunnel failure.


## Prepare bounded storage

Use a new operator-selected absolute directory on a persistent local filesystem. The
provisioner exclusively creates a 100 GiB ext4 image (the default cache ceiling of
ADR-0044), or a smaller one with `--size-gib N` (3 to 100), and refuses any existing
destination. It reserves actual host blocks before and after formatting, disables mkfs
discard and checks the measured allocation. The host needs the image size plus 2 GiB free
at creation. The directory must not share a tree with `MEDIA_ROOT`; the provisioner checks it
before creating anything (see below).
It never mounts a filesystem, modifies fstab, replaces a disk or prunes another resource.

```sh
python3 scripts/create_retrieval_storage.py /absolute/path/to/new-storage
# or a smaller image: … /absolute/path/to/new-storage --size-gib 20
sudo mount -o loop,nodev,nosuid,noexec /absolute/path/to/new-storage/retrieval.ext4 /absolute/path/to/new-storage/mount
sudo chown "$(id -u):$(id -g)" /absolute/path/to/new-storage/mount
chmod 700 /absolute/path/to/new-storage/mount
```

Mounting requires the operator's interactive sudo authentication. Do not put that password
in chat or a script. The original WireGuard file is read only, validated and copied into
private installation state. The initializer never resets a foreign or partial installation.

```sh
mise x -- just retrieval-init /absolute/path/to/new-storage/mount /absolute/path/to/private-wireguard.conf
mise x -- just retrieval-start /absolute/path/to/new-storage/mount
mise x -- just retrieval-status /absolute/path/to/new-storage/mount
mise x -- just retrieval-stop /absolute/path/to/new-storage/mount
```

Export `MEDIA_ROOT` (absolute path of the library) in the shell that runs the provisioner
and these commands: provisioning, initialization, start and status refuse a mount equal to,
containing or inside it (`storage_inside_media_root`). The check fails closed: an unset,
empty or relative value is refused (`media_root_undeclared`). On a host without a library,
export `MEDIA_ROOT=none`. Stop never needs the variable.

Only the `retrieval` directory below that exact mount is writable to the client. File
and directory ownership, mount identity/capacity/options, the 2 GiB free reserve and
source configuration fingerprint are checked. Writable config/download directories must
be real private directories on that filesystem; nested mounts are refused. Effective
gateway environment allows only the reviewed policy and pinned Alpine PATH. Stop bypasses the free-space/runtime-file
checks so damage to a password or client configuration does not prevent an owned stop.

No port is published. Status authenticates through Docker-exec loopback HTTP, verifies
the empty queue, actual namespace identity, DNS, IPv6, resources and non-host egress.
Credentials/cookies stay in private files or process stdin and are not printed.
New installations record the operator credential name and a timezone-aware 90-day expiry
in private `credential.json`. Missing, malformed or expired metadata refuses start/status
and attempts an owned ordered stop. There is no automatic renewal or in-place password replacement yet (#453): after expiry,
initialize a new installation on new storage. Both services use `restart: "no"` on purpose:
only the controller starts them, after its proofs, so a reboot never brings the client up unverified.
An installation without this metadata, or with another manifest version, is refused:
there is no migration command; initialize a new installation on new storage.
Stop remains available without the credential file. A failed status proof also stops the
owned client before its gateway; an unconfirmed stop remains a failure.
qBittorrent 5.3's `QBT_SID_8080` and legacy `SID` cookie formats are supported.

An existing saved transfer is refused before startup; a nonempty live queue fails verification
and startup stops the owned stack. Admission, payload-size policy and transfer reconciliation
arrive with #311 and #437 before any real acquisition is enabled.

## Recovery and rollback

Start stops client before gateway, removes only the owned pair and recreates them together;
the client never retains an old gateway namespace. A failed post-start check attempts an
ordered stop and keeps private data. Another lifecycle command cannot overlap the file lock.
API/path/subnet/permission/scan failures are categorical; never print raw daemon/app logs.

Stop leaves the mounted filesystem and all data intact. There is no auto-mount or auto-start
after reboot; remount the existing image, then run status/start. Do not rerun the provisioner
against that directory. Unmount only after stopping the owned client/gateway.

The [QA record](../../docs/architecture/qa/2026-11-26-issue-328-local-retrieval.md)
separates the November 2026 connected/restart/fault evidence from the pending owner-run
checks (tunnel-only failure, transfer recovery, staging, ARM64 runtime). An image scan is not proof of those
failure modes. No Pi, staging, host routing or Tailscale change belongs to this installation.

## ARM64 artifact preparation

The reviewed local runtime is AMD64. On 2026-11-18, a read-only registry query confirmed
that the pinned qBittorrent manifest index includes a Linux ARM64 descriptor. This proves
artifact availability only, not its ARM64 scan, resource behavior or Pi runtime acceptance. `gluetun-arm64` is a separate Bake target that exports
an OCI archive under ignored `data/build-artifacts/local-retrieval/`; it does not load or
replace that image, change the Compose pin, push a registry tag or deploy to the Pi.

```sh
docker buildx bake -f deploy/local-retrieval/docker-bake.hcl --print gluetun-arm64
mise x -- just retrieval-build-arm64 EXPLICIT_ARM64_CAPABLE_BUILDER
```

The builder argument is required; the command does not switch the global builder used by
other work. Check its advertised platforms first. The local builders inspected during
recovery advertise AMD64/386 only, so an ARM64 build is not claimed. No privileged binfmt
installation, emulator setup, builder reconfiguration or Pi-side command is implicit.
An explicitly prepared native ARM64 builder or separately approved emulator setup is a
prerequisite. Afterwards, inspect the archive's architecture, scan its exact image with
the pinned engine, and qualify real runtime behavior on ARM64 before adopting its pin.
A native ARM64 candidate was built and scanned on 2026-11-18; its identity and the ARM64
qBittorrent manifest are the `ARM64_RETRIEVAL_IMAGES` pins of the controller, which selects
them on an ARM64 host and refuses an image of another platform. ARM64 runtime qualification
is owner-run and pending.

## Cleanup ownership proof

Stop/removal use inspected immutable container IDs, not Compose service selection. Both
the installation nonce and any Compose project/service labels are checked against exact
names. A foreign project-labelled member refuses mutation; missing Compose labels do not
prevent stopping a proven nonce-owned ID. Stop confirms actual `Running=false` for each ID,
tries gateway after client failure and reports unconfirmed cleanup as failure. Removal
requires stopped state and uses neither force nor volume deletion. The Docker contract
suite exercises missing/foreign labels on network-disabled, never-started fixtures.

## Owner-run fault experiments

`mise x -- just retrieval-fault-plan` prints only the bounded R328-F01 plan (abrupt owned
gateway exit); `mise x -- just retrieval-fault-f02-plan` prints the R328-F02 plan
(interruption of the owned VPN endpoint). The active recipes `retrieval-fault-f01` and
`retrieval-fault-f02` are for the owner only. Each requires clean committed source, a private owner-confirmed exact-card scope (`data/local-retrieval/fault-scope.json`, git-ignored) and a separate
go for that run; the command does not grant permission or create the scope. Default planning
and unit tests perform no live fault. The 300-second budget includes a 60-second emergency
stop reserve, and failed/uncertain recovery remains red. No retry, transfer, host-route or
Pi action is included; F02 installs and removes one exact packet rule for the owned
endpoint only.
