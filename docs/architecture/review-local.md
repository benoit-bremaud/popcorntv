# Local review — popcorntv (#45 @fastify/static bump)

Local review gate for the `@fastify/static` bump that clears the `glob` and `minimatch` advisories.

- Date: 2026-11-06
- Commit: 91867bf
- Scope: branch diff `origin/main...chore/45-bump-fastify-static` (`--push`)
- Checks run: adversarial (Opus, 1 round) · security · correctness; design, docs and tests not run (lockfile and version range only, no source change)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 0

## Adversarial review (#236)

- Round 1 on `91867bf`: Must 0 · Should 0 · Nice 0 · unverified 1 (image scan, run below) · Push gate: open
- Round 2: not needed, round 1 open and nothing committed after it except this report
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex optional

## Pre-merge gate (head SHA 91867bf)

| Step | Result |
|---|---|
| 0 CI mirror | ✅ typecheck, lint, format:check, test, build (`ci.yml`) · ✅ Hadolint, Trivy config, Trivy image on a `--pull` build (`docker-security.yml`) · CodeQL, dependency-review, Scorecard, gitleaks action: CI-only |
| 1 Tests | ✅ 38 shared · 497 server · 198 web |
| 2 Coverage | server 98.63 % lines / 93.78 % branches · web 99.41 % / 92.83 % · shared 88.57 % / 100 % · docs ⏸ deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) |

- Gate: `--push`: **pre-push green**, SonarQube, doc coverage and E2E deferred
- `pnpm audit --prod`: no known vulnerabilities (base: 2 moderate, GHSA-3g3m-2fjr-6pw4 and GHSA-g3hv-75wg-m249)

## 🔴 Must Have

_None._

## 🟡 Should Have

_None._

## 🔵 Nice to Have

_None._

## ⚪ Disagree / Intentional

- `PROJECT_LOG.md` `[adversarial]` · not touched · the log entry ships after the merge in its own `docs(log)` PR (`2064785`, `978cabb`)

## Per-dimension summary

- Adversarial: lock integrity matches the registry, engines fit Node 22, the glob code path is unused (`serve: false`), real-plugin artwork tests pass.
- Security: two moderate prod advisories cleared. The dev-only `minimatch` (via `typescript-eslint`) and `esbuild` (via `drizzle-kit`) advisories are out of scope and filed as a follow-up.
- Correctness: two files, both needed; the tree stays clean after install.
