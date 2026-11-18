# Raspberry Pi staging preparation

Prepare the independent PopCornTV application and Caddy deployment for product QA on the Pi.

## Host preflight

The operator confirmed on 2026-11-18 that `bb-homelab` is ARM64, Docker uses
`/mnt/appdata/docker` on the mounted USB disk, and the private bind tree
`/mnt/appdata/popcorntv-staging` passed the versioned storage guard. The
candidate Caddyfile and a mode-0600 `app.env` were installed. Refresh the
Caddyfile from the approved revision before startup. The initial
environment file has no TMDB token. Configure one through the staging-only
secret process before exercising TMDB-dependent cases.

The initial QA preflight confirmed the Pi's Tailnet IPv4 and TCP 8443 was
free. The final staging origin is
`https://popcorntv-staging.bb-homelab.local:8443`. Verify its client-side
host mapping against the Pi's Tailnet IPv4 before startup. Docker and the
host already use `172.30.0.0/16`, so the
initial `172.30.220.0/24` proposal was rejected. The operator verified
`10.231.200.0/24` and the in-bridge Caddy address `10.231.200.10`
against the current route and Docker network inventories. Recheck the
binding, bridge and host resource budget before startup.

## Candidate artifact evidence

| Artifact | Exact candidate identity |
|---|---|
| PopCornTV image ID | `sha256:18cb71ef984217c6197eaa952b9704ba9df9533f0e561a348f55f1e84780aa18` |
| PopCornTV source of the candidate build | `2583cc3da8f3f7e8af8deb39be5ee8e61710284a` |
| Caddy runtime reference on the Pi | `popcorntv-caddy@sha256:0b668fea0a1742017608c1ddbc15d5c62b2eb5565c1a199dbb6d06d2e6dbbd42` |
| Caddy scanned image configuration | `sha256:d78b581dce3529dfdb9ab4a950b7b1cb439a042ba91007e74a2b5bb3fc59a7db` |
| Caddy transferred archive checksum | `sha256:d0b8ed79abc3260f485715cd660fd2839868df74c58eeb6fe05a4c2ef7db4c6b` |

The PopCornTV candidate was built natively on the Pi. The production install
uses the frozen lockfile and the offline store. The build checked native
SQLite, the shared package and both web entry pages. The pinned Trivy
0.76.0 scan of the exact image returned zero HIGH or CRITICAL findings.

The two earlier official Caddy candidates failed the blocking scan. The
versioned ARM64 replacement was built from
[Caddy upstream commit 16618f454ca6](https://github.com/caddyserver/caddy/commit/16618f454ca6f78f37dfd85a90573d8ffd43c1c8).
It passed the same Trivy threshold. The transfer checksum, architecture,
manifest, image configuration and six layer identities were verified.
The Pi reports the OCI manifest as its image ID. The manifest binds the
scanned image configuration, which the PC reports as its image ID.

The scan reports and archive are retained in ignored local build artifacts
under the original preparation worktree, in `data/build-artifacts/`.
These candidate checks are evidence for those exact artifacts. Record the
merged, attested application revision and matching image before deployment.

## Remaining qualification

- Complete the signed delivery gate for [#361](https://github.com/benoit-bremaud/popcorntv/issues/361).
- Use the [Pi staging runbook](../../../deploy/pi-staging/README.md) for native
  startup. Verify HTTPS and Caddy trust from the QA client.
- Start [FULL product QA](../../testing/qa-full-staging-checklist.md) with
  dedicated staging data. Record native health and resource observations.
- Track retrieval and its runtime acceptance in
  [#328](https://github.com/benoit-bremaud/popcorntv/issues/328).
