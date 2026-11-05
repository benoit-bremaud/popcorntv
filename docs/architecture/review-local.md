# Local review — popcorntv (#65 smoke mocks the profiles API)

Pre-push review of branch `test/65-smoke-profiles-mock`.

- Date: 2026-11-05
- Commit: b8d5394
- Scope: branch diff `origin/main...HEAD` (`apps/web/e2e/catalog.smoke.spec.ts`)
- Checks run: adversarial (Opus, 3 rounds) · tests · correctness (test-only change, no product code, no container file)
- Verdict: ship · Must 1 fixed · Should 2 fixed · Nice 2 fixed

## Adversarial review (#236)

- Round 1 on `e5f4803`: Must 0 · Should 2 · Nice 1 · Push gate: open
- Round 2 on `d5fd4af`: 3 fixed · new Must 1 (runtime import of `DEFAULT_PROFILE_ID` needed a built `packages/shared/dist`) · Push gate: closed
- Round 3 on `2fef850`: 5 fixed · new Must 0 · Nice 1 (comment over 100 columns, fixed in `b8d5394`) · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot cannot be requested on this repo · Codex `@codex review` requested on PR #66 (optional)

## Pre-merge gate (head SHA d58a315)

| Step | Result |
|---|---|
| 1 Tests | ✅ 334 server · 129 web · 31 shared (Vitest) · ✅ smoke 1/1 (Playwright) |
| 2 Coverage | server 98.3 % stmts / 95.6 % branches / 95.6 % funcs / 98.4 % lines · web 99.8 / 93.4 / 100 / 100 · shared 88.9 / 100 / 100 / 86.7 (floor 80) · docs: no new export |
| 3 SonarQube | ✅ PASSED |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ 1 journey (catalog) on the Vite build with mocked API · QA pass: not applicable (test-only change) |

- Gate: **GREEN** on `d58a315`; the next commit changes only this report

## 🔴 Must Have (fixed)

- `apps/web/e2e/catalog.smoke.spec.ts:2` `[adversarial]` · Runtime import from `@popcorntv/shared` resolved to the gitignored `dist/` · imports are type-only, the profile id is a literal.

## 🟡 Should Have (fixed)

- `apps/web/e2e/catalog.smoke.spec.ts` `[adversarial][correctness]` · Unmocked API calls reached a live server through the Vite proxy · catch-all `route.abort()` registered first.
- `apps/web/e2e/catalog.smoke.spec.ts` `[adversarial][tests]` · Mocks were not checked against the shared contracts · `satisfies Library` / `Media[]` / `Profile`.

## 🔵 Nice to Have (fixed)

- `apps/web/e2e/catalog.smoke.spec.ts` `[adversarial]` · Profile button matched by substring · `exact: true`.
- `apps/web/e2e/catalog.smoke.spec.ts:48` `[adversarial]` · Comment over the 100-column width · wrapped.

## ⚪ Disagree / Intentional

- `.github/workflows/ci.yml` · The Playwright smoke is not run in CI; out of scope, filed as a follow-up issue.

## Per-dimension summary

- Adversarial: three rounds, gate open. · Tests: the smoke is hermetic and typed. · Correctness: no unmocked request on this flow (`posterPath: null`).
