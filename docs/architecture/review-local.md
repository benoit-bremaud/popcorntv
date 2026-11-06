# Local review — popcorntv (#96 node base bump)

Local review gate for the Node base image bump that clears CVE-2026-109518 in `apt`.

- Date: 2026-11-06
- Commit: 62bda5a
- Scope: branch diff `origin/main...chore/96-bump-node-base` (`--push`)
- Checks run: adversarial (Opus, 2 rounds) · containers · security · correctness; design, docs and tests not run (two `FROM` lines and one comment, no source change)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 1 open

## Adversarial review (#236)

- Round 1 on `413ff3e`: Must 0 · Should 2 · Nice 1 · Push gate: open
- Round 2 on `ee3684b`: 2 fixed · 0 not fixed · 0 regressed · new Must 0 · **Push gate: open** (the commit-body Nice was applied in `62bda5a`, message only)
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex optional

## Pre-merge gate (head SHA 62bda5a)

| Step | Result |
|---|---|
| 0 CI mirror | ✅ typecheck, lint, format:check, test, build (`ci.yml`) · ✅ Hadolint, Trivy config, Trivy image on a `--pull --no-cache` build (`docker-security.yml`) · CodeQL, dependency-review, Scorecard, gitleaks action: CI-only |
| 1 Tests | ✅ 38 shared · 497 server · 198 web · ✅ container healthy (Node 22.23.4, apt 2.6.2) |
| 2 Coverage | unchanged from `main` (no source change) · ⏸ deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) |

- Gate: `--push`: **pre-push green**, SonarQube, coverage and E2E deferred

## 🔴 Must Have

_None._

## 🟡 Should Have

_None._

## 🔵 Nice to Have

- `Dockerfile:32` `[adversarial]` · "re-check on each base bump" does not say what to check · add "(apt list --upgradable on the new base, Trivy image scan)"
- `.github/dependabot.yml` `[adversarial]` · Node majors keep being proposed (#50) · ignore `version-update:semver-major` for `node` in a follow-up issue

## ⚪ Disagree / Intentional

_None._

## Per-dimension summary

- Adversarial: round 1 caught that CI was green (cold runners re-run `apt-get upgrade`) and only a cached local build kept apt 2.6.1; the cause is reworded in the commit and issue #96.
- Containers: multi-arch index digest pinned in both stages, Hadolint and Trivy clean, non-root, `tini` PID 1.
- Security: one HIGH fixed CVE cleared on cached builds; trust model unchanged.
- Correctness: one file, both `FROM` lines consistent, no stale copy of the old re-check rule.
