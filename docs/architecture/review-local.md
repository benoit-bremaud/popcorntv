# Local review — popcorntv (#38 Docker conformance)

Pre-push and pre-merge gate for issue #38: digest-pinned base images, pinned Dockerfile frontend
with build checks, grouped Dependabot docker updates.

- Date: 2026-11-02
- Commit: `7f8c778`
- Scope: branch diff `origin/main...HEAD` (`Dockerfile`, `.github/dependabot.yml`)
- Checks run: containers (docker-auditor) · security · correctness; design, docs and tests not
  applicable (no source code in the diff)
- Verdict: ship as-is · Must 0 · Should 0 (1 fixed) · Nice 1

## Pre-merge gate (head SHA 7f8c778)

| Step | Result |
|---|---|
| 1 Tests | ✅ 19 shared · ✅ 300 server · ✅ 125 web |
| 2 Coverage | server 98.1 % stmts / 95.41 % branches / 95 % funcs / 98.18 % lines · web 99.79 / 93.35 / 100 / 100 · shared 87.09 / 100 / 100 / 84 (floor 80) · docs: not applicable (no source change) |
| 3 SonarQube | ✅ PASSED (localhost:9000, `popcorntv`) |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke (tooling diff): `docker build --pull --no-cache` OK · `GET /health` 200 · `/proc/1/status` Uid/Gid 1000 · `docker build --check` no warnings · `make lint-docker`, `make scan-docker-config`, `make scan-docker-image` green |

- Gate: **GREEN — merge authorised** (after owner approval)

## 🔴 Must Have

_None._

## 🟡 Should Have

- `Dockerfile:2` `[containers]` · `# check=error=true` missing after the pinned `# syntax=` line
  (docker-hardening §1) · fixed in `7f8c778`, `docker build --check` clean.

## 🔵 Nice to Have

- `Dockerfile:1` `[containers]` · Dependabot does not bump `# syntax=docker/dockerfile:1.28`;
  bump it by hand when a new minor ships.

## ⚪ Disagree / Intentional

- `Dockerfile:27-33` `[containers]` · DL3005 `apt-get upgrade` stays: inline waiver with reason,
  re-check note added for every base bump.
- BuildKit cache mounts and buildx `gha` cache not added: CI image job takes ~2 min (owner MCDA
  2026-11-02, option A 450/500).

## Per-dimension summary

- Containers: conformant · Security: digest pins tighten the supply chain, no new surface ·
  Correctness: build, run and scans verified · Design / Docs / Tests: not applicable.

Gotcha seen: with the base pinned by digest, a local rebuild reuses the cached `apt-get upgrade`
layer (same parent, same command) and misses new Debian fixes; Trivy flagged 2 fixed CVEs until a
`--no-cache` rebuild. CI runners start cold, so CI is not affected.
