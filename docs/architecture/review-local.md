# Local review — popcorntv (#72 global rate limit)

Pre-push review of the branch that adds a global per-client HTTP rate limit.

- Date: 2026-11-06
- Commit: 8916341 (fixes on top of 7023e1f)
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 2 rounds) · design · docs · tests · security · correctness
- Verdict: ship · Must 0 open · Should 0 open · Nice 2 open (follow-ups)

## Adversarial review (#236)
- Round 1 on `7023e1f`: Must 2 · Should 3 · Nice 3 · unverified 1 · Push gate: closed
- Round 2 on `8916341`: 2 Must fixed · 3 Should fixed · 2 Nice fixed · 0 regressed · new Must 0 · **Push gate: open**; its Should (ADR context wording, CodeQL score) and two Nice (alert attribution, nosniff assert, `/health` note) applied in the report commit.
- Hosted reviewers (filled at the pre-merge run): Codex optional (answer if it posts).

## Pre-merge gate (head SHA 8916341, `--push` mode)
| Step | Result |
|---|---|
| 0 CI mirror | ✅ install --frozen-lockfile · typecheck · lint · format:check · test · build · Docker build + `make lint-docker` + `scan-docker-config` + `scan-docker-image TRIVY_EXIT=1` · CI-only: CodeQL, Scorecard, dependency-review |
| 1 Tests | ✅ shared 38 · server 513 · web 199 |
| 2 Coverage | server 97.57 % stmts / 93.61 % branches / 95.97 % funcs / 98.64 % lines · ⏸ docs deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run |
- Gate: **pre-push green** — SonarQube, E2E and doc coverage deferred (never GREEN)

## 🔴 Must Have
- `apps/server/src/app.ts` `[adversarial|design|docs|security|tests]` · IPv6 not grouped by /64 although documented · fixed: `keyGenerator` uses `clientKey`, test added.
- `apps/server/src/app.ts`, `http.ts` `[adversarial|security]` · media routes exempt before auth, forged-cookie flood uncounted · fixed: separate `media` bucket at 10× the API max, test added.

## 🟡 Should Have
- `docs/architecture/diagrams/auth/02,03` `[adversarial]` · global limiter missing from UML · fixed.
- `apps/web/src/auth/auth-api.ts` `[adversarial]` · no message for `too_many_requests` · fixed.
- `docs/architecture/decisions/0011-global-rate-limit.md` `[adversarial|docs]` · alert numbers, "never 429" context, CodeQL score · fixed.
- `apps/server/src/app.test.ts` `[tests]` · weak asserts, no signed-in throttling case, no media-budget case · fixed.
- `apps/server/src/*.test.ts` `[design]` · `buildApp` test setup duplicated in 9 suites · follow-up issue.

## 🔵 Nice to Have
- `apps/server/src/config.ts:85` `[adversarial]` · proxy warning could mention the shared 300/min budget · open.
- Window reset not exercised with fake timers `[tests]` · open.

## ⚪ Disagree / Intentional
- `buildApp` async `[design]` · required to add the plugin hook before the auth hook (ADR-0011).

## Per-dimension summary
- Adversarial: 2 Must fixed, gate open · Design: reuse `clientKey`, fixture duplication follow-up · Docs: /64 claim fixed · Tests: asserts tightened, new cases · Security: IPv6 bypass and media flood fixed · Correctness: Retry-After and error path verified.
