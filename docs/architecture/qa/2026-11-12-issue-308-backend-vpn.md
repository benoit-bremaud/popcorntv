# Issue #308 — real backend and NordVPN experiments

The synthetic qBittorrent transfer and bounded VPN namespace checks passed; application playback feasibility remains **PARTIAL**.

## Real backend evidence

The owner approved local isolated execution. Two pinned qBittorrent 5.3.0 clients exchanged
a private, trackerless, synthetic single-file torrent on an internal-only Docker network.
API version: 2.16.2; libtorrent: 2.1.2.0. No Internet source or production library was used.

- Thirty-second fixture: 1,572,516 bytes, H.264, two synthetic tagged audio tracks and French captions.
- Download cap: 131,072 bytes/s. First decoded frame: 19,600 ms, verified prefix 262,144 bytes.
- An independent cache read at 19,610 ms confirmed that the complete reference was **not** present.
- Every fed range matched the reference. Complete video/audio frame checksums and captions matched.
- Restart after completed transfer restored complete coverage. Mid-transfer restart was not tested.

A previous six-second fixture exposed a false positive: piece-state polling still reported an
incomplete transfer after all bytes had arrived. The harness now independently checks actual
cache bytes at first frame and rejects that case. The longer fixture widens the observation
window; it does not relax this assertion or establish a production buffer threshold.

The qBittorrent image scan passed with zero HIGH/CRITICAL findings using Trivy 0.76.2 and the
local 2026-11-12 database. The Compose config scanner reported zero targets: **no config-scan
pass is claimed**. Rendered topology assertions and mutation tests check the isolation instead.

## NordVPN evidence

`scripts/nordvpn-spike.py` reads an owner-supplied WireGuard file outside the repository.
It validates an allowlist of fields, key lengths, full IPv4 routing and a public resolved
endpoint. Only a private temporary copy is adapted for Gluetun; the original is not rewritten.
Neither credentials nor public IP addresses are printed or preserved in the result.

The namespace experiment passed with the actual qBittorrent process running:

| Check | Observed result |
|---|---|
| Tunnel egress | HTTPS IP echo succeeds; observed address differs from host baseline |
| DNS during connection | Named HTTPS request succeeds |
| Client authentication | Login succeeds; DHT, PeX, LSD and UPnP are false in authenticated preferences |
| Controlled tunnel stop | Three direct IPv4 HTTPS probes fail |
| Direct external DNS during stop | Query to 1.1.1.1 fails |
| IPv6 during stop | IPv6 HTTPS probe fails; IPv6 is deliberately disabled |
| Tunnel recovery | Explicit start restores successful HTTPS egress |
| Cleanup | Created containers removed; private temporary workspace removed |

The client shares only Gluetun's network namespace, runs as the owner's non-root UID, drops
all capabilities, has a read-only root filesystem and mounts only temporary client data/config.
No published ports, host networking, Docker socket or host media mounts are used.

Gluetun is a network appliance requiring root and NET_ADMIN in this experiment. DAC_OVERRIDE
is additionally retained to read the owner's 0600 bind-mounted secret copies. All other
capabilities are dropped; no-new-privileges and resource limits apply. Its root filesystem
remains read-only; /tmp, /run and /gluetun use bounded tmpfs mounts. PUID/PGID 0 reuse the existing
identity because automatic user creation attempted to modify read-only /etc/passwd. These
are measured exceptions for the VPN appliance, not permissions granted to qBittorrent.
Kernel WireGuard worked without creating /dev/net/tun or changing host routes.

This tests **controlled VPN stop**, not unexpected process death, packet blackholing,
container restart, DNS leak capture or sustained recovery throughput. No torrent was acquired
over the VPN. The synthetic peer transfer and VPN checks are separate experiments.

## Image qualification

The initially proposed stable v3.41.3 digest failed the local scan: **41 HIGH package matches,
37 distinct CVEs, zero CRITICAL**. It was not executed with the owner's credentials.

The official registry's newer image was inspected and pinned by immutable digest:
`qmcgaw/gluetun@sha256:cbafe0945d0fe5a3c55ca64d43a85c5db270458f4c645ee65797b527f6f57a64`.
Its declared commit `450ce09f4843febfdb67c589f652997e68153180` was found in the upstream repository;
image creation time is 2026-11-12T04:18:38.891Z. Its source label names `passteque/gluetun`, while
the commit was also verified through `qdm12/gluetun`. This is provenance metadata inspection,
not cryptographic signature verification. The image scan returned zero HIGH/CRITICAL findings.

The newer image is a **development build**, not a newly published stable release. No floating
tag is used at execution. Using its digest is an experiment-only exception to the exact-release
tag convention; production adoption and future supported release selection remain open.

The comparison after discovering the failed stable scan is:

| Option | Security 50 | Reproducibility 30 | Stability 20 | Total /500 |
|---|---|---|---|---|
| A: original stable digest | 0: scan fails | 5: fixed digest | 5: stable release | 250 |
| B: scanned upstream development digest | 5: scan passes | 5: fixed digest | 2: development build | 440 |
| C: maintain a rebuilt stable image | 5: require clean scan | 4: extra build inputs | 3: locally maintained patches | 430 |

B is used only for this bounded experiment. Sensitivity: lowering B's security score from 5
to 4 makes C preferable (390 versus 430). A remains ineligible under the scan gate regardless
of its weighted score. Further analysis remains possible before deployment.

## Diagnostics and reproduction

Prerequisites: Python 3, Node 22+, Docker, FFmpeg/ffprobe, the pinned images already pulled and
scanned, and a private 0600 WireGuard file. The script does not install software or start services
automatically on boot. Run only on the owner's local test machine.

```sh
node scripts/progressive-playback-spike.test.mjs
node scripts/qbittorrent-spike.test.mjs
python3 -B scripts/test_nordvpn_spike.py
python3 -B scripts/nordvpn-spike.py --run --config /absolute/path/to/private.conf
# Optional per-command timing/status diagnostics, still without command arguments or outputs:
python3 -B scripts/nordvpn-spike.py --run --debug --config /absolute/path/to/private.conf
```

Structured UTC lifecycle logs go to stderr; the result JSON goes to stdout. Events cover
configuration, container startup, verified egress, authenticated client settings, tunnel stop,
blocked probes, recovery, command failures and cleanup. Expected connection polling failures
are not logged individually. Credential-bearing commands, stdin, raw stderr, passwords,
cookies and IP values are excluded. Bootstrap diagnostics report categorical flags only; arbitrary upstream log lines are not displayed.

Focused verification: 13 media-reader tests, 5 qBittorrent tests and 10 VPN test methods pass
(including parameterized failure scenarios).
The VPN tests mock only OS/network boundaries; they validate actual config transformation,
refusals and secret-free failure logging. Ruff formatting/lint also pass. These opt-in Python
and Node script checks are not silently included in the application workspace CI command.

The VPN harness measures **100% statements/lines and 100% branches**, with no excluded lines:
207 executable statements, 62 branches, zero missed. Coverage.py 7.13.4 runs in a disposable
environment under /tmp; it is not added to the application's dependencies. The enforced
experiment gate is reproducible from the repository root:

```sh
python -m coverage run --rcfile=scripts/nordvpn-spike.coveragerc scripts/test_nordvpn_spike.py
python -m coverage report --rcfile=scripts/nordvpn-spike.coveragerc
```

The coverage combines real orchestration with doubled subprocess, DNS, HTTPS and time boundaries.
It asserts fail-closed behavior for connection timeouts, client/API absence, wrong egress,
unsafe discovery, DNS baseline failure, each simulated leak, creation and cleanup failures.
It also checks CLI opt-in, timeout logging and credential redaction. These tests do not replace
the real container experiment above. The 100% figure describes execution coverage, not proof
that every network failure is modeled.

Application validation also passed locally: typecheck, ESLint, Prettier, coverage and build.
Vitest reported 1,356 passed and 7 existing skipped tests. Line coverage is shared 100%, server
98.4%, web 98.96%. This is not a completed pre-push/release gate: browser smoke, Sonar and a fresh
adversarial review were not rerun in this VPN step. No push, PR, merge or Pi deployment occurred.

Documentation presence for this new Python harness is 4/4 top-level functions plus the module
docstring. The contracts explain side effects, secret handling, return values, errors and
the difference between controlled-stop checks and crash resilience. The source and measured
report were reviewed together for freshness. No PopcornTV HTTP API route was added or changed;
no whole-repository documentation-coverage percentage is claimed.

Machine-readable observations: [backend](2026-11-12-issue-308-backend.json) and
[VPN](2026-11-12-issue-308-vpn.json). No secret, public IP or account configuration is included.

## Remaining gate

The subsequent [player experiment](2026-11-12-issue-308-player.md) validated the actual HLS/player
with a controlled verified writer, including normal end and cancellation. Keep #308 open.
The later [combined experiment](2026-11-12-issue-308-combined.md) also validates the real backend
and browser together for one early-caption fixture. Seeks outside coverage, variable bitrate,
mid-transfer cancellation/restart, unexpected tunnel failure and Pi limits remain unverified.
Passing these bounded experiments does not make a wishlist title ready to watch.

Sources: [Gluetun WireGuard config](https://github.com/qdm12/gluetun-wiki/blob/main/setup/options/wireguard.md),
[control server](https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md),
[upstream commit](https://github.com/qdm12/gluetun/commit/450ce09f4843febfdb67c589f652997e68153180).


## Pre-push correction on 2026-11-13

Fresh adversarial review found that the historical reconnect observation established restored HTTPS,
not independently revalidated non-host egress. Treat `reconnected` in the original JSON as that
narrower observation. The corrected harness parses the recovered address and rejects host egress;
this correction was tested with mocked boundaries, without repeating the live VPN experiment.
Removal timeout, OS-error and nonzero-exit cases now attempt all container removals and retain the
private workspace if removal remains unconfirmed, preserving original and cleanup failures together.
The corrected harness requires Python 3.11 or newer (`sys.exception` and `ExceptionGroup`).
Updated coverage: 211 statements and 62 branches, 100%, no exclusions. Historical measurements above
remain tied to their earlier code version. See the current pre-push review for publication status.
