# Local review — popcorntv (fix/110-runtime-trixie-static-ffmpeg)

Pre-push review of #110: runtime image moved to Debian 13 trixie-slim with a static upstream FFmpeg, and the image scan gated on unfixed CVEs.

- Date: 2026-11-07
- Commit: 0987f5f (+ SECURITY.md table alignment and this report)
- Scope: branch diff origin/main...HEAD (`Dockerfile`, `Makefile`, `.trivyignore.yaml`, `SECURITY.md`, this file)
- Checks run: adversarial (Opus, 2 rounds) · containers (docker-auditor) · security and correctness through the adversarial review (design, docs and tests audits: n/a, no application code changed)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 0

## Adversarial review (#236)

- Round 1 on `0af0514`: Must 1 · Should 4 · Nice 3 · unverified 1 · Push gate: closed
- Round 2 on `0987f5f`: 8 fixed or tracked (#116) · 0 not fixed · 0 regressed · new Must 0 · **Push gate: open**; its one Nice (table alignment) applied in the next commit
- Hosted reviewers (filled at the pre-merge run): Codex optional

## Pre-merge gate (head SHA filled at the pre-merge run)

| Step | Result |
|---|---|
| 1 Tests | ✅ shared 38 · server 521 · web 199 |
| 2 Coverage | ✅ statements: server 97.49 % · web 99.11 % · shared 90.24 % (floor 80); docs: ⏸ deferred |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean · only `.env.example` tracked · diff read: no token or personal data |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`); container smoke done by hand: healthy, UID 1000, CapEff 0, HLS (libx264 + aac, `-ss`) and WebVTT extraction with the app's own argument builders |

- Container checks: `make lint-docker` ✅ · `docker build --check` ✅ · `make scan-docker-config` ✅ · `make scan-docker-image` (no `--ignore-unfixed`) ✅ exit 0 with `.trivyignore.yaml`, fails without it
- Gate: `--push`: **pre-push green** — typecheck, lint, format:check, coverage and build passed; SonarQube and E2E deferred.

## 🔴 Must Have

- `Makefile:38` `[adversarial|containers]` · waivers were inert while the scan kept `--ignore-unfixed` (audit SA-03) · fixed in `0987f5f` (flag dropped, owner MCDA option A 445/500)
- `.trivyignore.yaml` `[containers]` · no follow-up issue per waiver · fixed: #116 cited in every statement; `purls` instead of `paths` for OS packages documented in `SECURITY.md`

## 🟡 Should Have

_None open._ Fixed or tracked: static FFmpeg library blind spot (`SECURITY.md`), Dependabot 4-part tag (#116), decision record (PR body + `PROJECT_LOG.md`).

## 🔵 Nice to Have

_None open._ Applied: trixie note on `apt-get upgrade`, ffprobe note, grouped Dependabot PR note, `SECURITY.md` table alignment.

## ⚪ Disagree / Intentional

- `.trivyignore.yaml` `[containers]` · `purls` instead of `paths` · OS packages have no file path; Trivy 0.76.0 matches versionless purls (verified with and without the file)
- `.trivyignore.yaml` `[containers]` · "delete the waivers, CI ignores unfixed" · superseded by dropping `--ignore-unfixed` (issue #110 asks for recorded waivers, not the flag)

## Per-dimension summary

- Adversarial: one Must (inert waivers) fixed, gate open · Containers: pinned FROMs, non-root, HEALTHCHECK OK; waiver hygiene fixed · Security: CVEs 7 Critical / 68 High → 0 / 15 accepted, none in the media path · Correctness: build, version check and FFmpeg features verified in the image · Out of scope: no `-protocol_whitelist` on FFmpeg calls (follow-up next to #114)
