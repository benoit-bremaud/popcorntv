# QA record — #328 local VPN retrieval, 2026-11-26

This record summarises the evidence behind the empty VPN-only retrieval installation of
#328 and separates what was measured from what remains owner-run.

- Contract: [specification](../specs/nordvpn-retrieval.md), [designed cases](cases/328-nordvpn-retrieval.md).
- Scope: local AMD64 workstation, empty client, no real source, no transfer, no Pi action.
- Private evidence files (JSON, logs) stay with the owner and are not in the repository.

## Evidence on this branch — 2026-11-26

| Check | Result |
|---|---|
| `mise x -- just retrieval-check` (ruff, mypy strict on the five sources, pytest) | 347 passed, 93.11 % combined coverage |
| `python3 scripts/test-local-ci.py` (gate runner self-test) | passed |
| Real tunnel, real VPN file, Docker services | not started: owner-run only (NFR-17) |

The automated suite uses synthetic WireGuard text, fake Docker output and disposable
directories only. It adds, against the November code: the 100 GiB ceiling and `--size-gib`,
the fail-closed `MEDIA_ROOT` refusal (controller and provisioner), the ARM64 image pins and the refusal of the removed operations.

## Historical runtime evidence — November 2026

Measured on the earlier unpublished branches of #328, whose runtime code this branch ports.
The filesystem ceiling was then 20 GiB. These runs were **not repeated** on this branch and
are not a claim about its exact head.

| Date (UTC) | Run | Source | Result |
|---|---|---|---|
| 2026-11-15 | Image scan | first candidate | Upstream Gluetun image refused (41 HIGH findings, 37 CVEs); rebuilt from source with a patched Go toolchain and Alpine base, scan clean |
| 2026-11-15 | Connected start and ordered restart | first candidate | Passed: health, shared namespace identity, zero host ports, zero effective capabilities on the client, authenticated empty API, anonymous API denied, egress address different from the host, IPv6 disabled, no secret in logs, WireGuard file bytes unchanged |
| 2026-11-15 | Controlled gateway stop (owner-approved) | first candidate | Passed in 24.75 s: IPv4, DNS and IPv6 denied while the gateway was down, positive controls before and after |
| 2026-11-18T09:14:04Z | R328-F01 abrupt gateway exit | `a8d103d` | Passed in 32.451 s (fault 14.257 s): three fault samples denied (IPv4 timeout, DNS timeout, IPv6 refused), both containers replaced, healthy and empty after recovery |
| 2026-11-18T11:05:09Z | R328-F02 owned endpoint interruption | `f3a20e1` | Passed in 16.671 s: rule counters +4 / +4 / +7, same container generation recovered, the exact rule removed |
| 2026-11-18T11:22:04Z | R328-F03 storage fixture (3 GiB ext4) | `f786c06` | Passed: reserve refusal at 2,147,475,456 bytes available, kernel `ENOSPC` at 0, 3,076,538,368 bytes restored; fixtures removed |

## Pending — owner-run

| Item | Status |
|---|---|
| Connected start, status and stop of this branch's head on the workstation | NOT TESTED |
| Tunnel-only failure with the gateway container alive; outside packet observation | NOT TESTED |
| Transfer identity and bytes under restart (needs #311 and #437) | NOT APPLICABLE to the empty slice |
| Staging replay of the connected start and failure rows (E328-02/03) | NOT TESTED |
| ARM64 runtime on the Pi (owner decision required) | NOT TESTED |
