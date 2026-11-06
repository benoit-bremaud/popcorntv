# Local review — popcorntv (#73, #18 lot 2)

Local review gate for the invitations, reset links and account administration brick.

- Date: 2026-11-06
- Commit: bd98e84
- Scope: branch diff `origin/main...feat/73-auth-invitations-admin` (`--push`)
- Checks run: adversarial (Opus, 5 rounds) · design · docs · tests · security · correctness
- Verdict: ship as-is · Must 0 open · Should 0 open · Nice 0 open in scope (follow-ups below)

## Adversarial review (#236)

- Round 1 on `dd9d86d`: Must 2 (owner self-delete answered 500; stale CLAUDE.md server layout) · Push gate: closed
- Round 2 on `da1b264`: all round 1 findings fixed · new Must 0 · new Should 1 (revoking a reset link hid any shown link) · Push gate: open
- Round 3 on `a0aec13`: Should and two Nice fixed · new Should 1 (devices failure refresh untested, fixed in `43d0622`) · **Push gate: open**
- Round 4 on `aa54777` (Codex P2 fixes): both fixed · new Should 1 (deletion left a revoked reset link on screen) · Nice 1 (wasted reloads after self-demotion), both fixed next · **Push gate: open**
- Round 5 on `d97d6f1` (deletion fix, SonarQube fixes): all fixed · new Should 1 (`<p>` inside `<output>`) and the demotion test Nice, both fixed in `bd98e84` · **Push gate: open**
- Hosted reviewers: Codex reviewed `85e6d93`: 2 P2 (a role change and a self-demotion left stale admin state), fixed in `aa54777`; Copilot out of credit

## Pre-merge gate (head SHA bd98e84)

| Step | Result |
|---|---|
| 0 CI mirror | ✅ install, typecheck, eslint (`apps packages`), format:check, tests, build on Node 22; CodeQL, dependency-review CI-only |
| 1 Tests | ✅ shared 38 · server 470 · web 198 |
| 2 Coverage | server 97.5 % lines · web ~98.9 % lines (floor 80) · docs not measured (no doc counter in this repo) |
| 3 SonarQube | ✅ PASSED on `bd98e84` (first run FAILED with 7 new issues, fixed in `d97d6f1`) |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ Playwright catalog smoke 1/1 on the local prod build · QA pass: on staging, with the R12 security review |

- Gate: **GREEN** on `bd98e84`, except doc coverage (no counter in this repo); the head commit only adds this report.

## 🔴 Must Have

_None open._ Fixed in `da1b264`:

- `apps/server/src/auth/user-routes.ts` `[adversarial]` · Owner self-delete answered 500: the event row pointed at the deleted user · The event now records `userId` null.
- `CLAUDE.md` `[adversarial|docs]` · The server layout was stale · It now lists the token repository and the user routes.
- `docs/architecture/diagrams/auth/` `[docs]` · The diagrams were missing the pre-hash token check and revocation · The sequence and class diagrams are updated.
- `apps/server/src/auth/token-repository.test.ts` `[tests]` · There was no token expiry test and no demotion test · Both are added.

## 🟡 Should Have

_None open._ Fixed:

- `apps/web/src/auth/AdminPanel.tsx:225` `[adversarial]` · Revoking a reset link cleared any shown link · Now only that account's reset link is cleared (`a0aec13`).
- `apps/web/src/auth/AdminPanel.test.tsx` `[adversarial|tests]` · The refresh after a failed devices load had no test · A test is added (`43d0622`).

## 🔵 Nice to Have

Fixed:

- `apps/web/src/auth/AdminPanel.tsx` · A failed devices load now refreshes the lists.
- `docs/architecture/specs/auth.md` · R8 now covers wrong tokens and lockout lifting.

Deferred as follow-ups:

- `eslint.config` · Add an ESLint ignore for `.claude/**`, where stale local worktrees break `pnpm lint`.
- `apps/server/src/auth/routes.ts` · Links ignore any path prefix in `PUBLIC_URL`.
- `apps/server/src/auth/routes.ts` · Add a per-token attempt cap.
- `apps/web/src/auth/AuthGate.tsx` · Handle `hashchange`.
- Device list · Add a "this device" flag.
- Self-demotion · Ask for confirmation.
- Event list · Add an actor column.
- `apps/web/src/auth/AdminPanel.tsx:92` · A failed load for another account leaves the open devices list on screen.

## ⚪ Disagree / Intentional

- CodeQL `js/missing-rate-limiting` on LoginLimiter-guarded routes is a known false positive (#72).

## Per-dimension summary

- Adversarial: 3 rounds, gate open.
- Design: no Must; flat layout kept.
- Docs: spec and diagrams match the code.
- Tests: expiry, refund and self-delete paths are covered.
- Security: no Must; tokens are hashed and single-use; a token is checked before any hashing.
- Correctness: the self-delete 500 is fixed.
