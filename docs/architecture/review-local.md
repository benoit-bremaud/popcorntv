# Local review — popcorntv (#18 R12 findings)

Local review gate for the fixes of the #18 R12 security review and QA pass.

- Date: 2026-11-06
- Commit: 17fee64
- Scope: branch diff `origin/main...fix/18-auth-r12-findings` (`--push`)
- Checks run: adversarial (Opus, 2 rounds) · design · docs · tests · security · correctness
- Verdict: ship · Must 0 · Should 0 open · Nice 0 open

## Adversarial review (#236)

- Round 1 on `228d586`: Must 1 · Should 4 · Nice 2 · unverified 0 · Push gate: closed
- Round 2 on `7974e2c`: 7 fixed · 0 not fixed · 0 regressed · new Must 0 (1 new Should, a
  missing `/0` test, fixed in `17fee64` and proven by a mutation run) · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex optional

## Pre-merge gate (head SHA 228d586 for steps 2, 3 and 5; 17fee64 for steps 1 and 4)

| Step | Result |
|---|---|
| 0 CI mirror | `ci.yml`: typecheck · lint (`eslint apps packages`; plain `pnpm lint` walks the untracked `.claude/worktrees`, #79) · format:check · test · build, all green; `docker-security.yml` not triggered (no Dockerfile, lockfile or package change); CodeQL, dependency-review, Scorecard, gitleaks workflow: CI-only |
| 1 Tests | ✅ 38 shared + 497 server + 198 web · smoke 1/1 |
| 2 Coverage | server 97.6 % stmts / 93.8 % branches / 95.9 % funcs / 98.6 % lines · web 99.1 / 92.8 / 98.4 / 99.4 · shared 90.2 / 100 / 100 / 88.6 (floor 80) · docs: not measured (no counter in the repo) |
| 3 SonarQube | ✅ PASSED |
| 4 Secrets | ✅ gitleaks history clean; tree scan flags only the untracked `.claude/worktrees/3-library-scan-6c4678` Playwright log · no tracked `.env` · diff read: QA screenshots mask the invitation link, test passwords only in the scratchpad |
| 5 E2E/smoke | ✅ 1 journey on the local prod build · QA pass: done on the production-like stack before the fixes, re-checked after (`qa/2026-11-06-auth.md`) |

- Gate: `--push`: **pre-push green** — steps 2, 3 and 5 re-run on the head before the merge
  question

## 🔴 Must Have

- `docs/architecture/diagrams/auth/02-sequence-invite-and-accept.md:69` `[adversarial]` ·
  stale revocation rule · fixed in `7974e2c`

## 🟡 Should Have

- `apps/server/src/config.ts:108` `[adversarial]` · `/0` passed the validator then crashed
  Fastify · fixed in `7974e2c`, test in `17fee64`
- `docs/architecture/diagrams/auth/02-sequence-sign-in.md:33,84` `[adversarial|docs]` ·
  lookup order and `TRUST_PROXY` note stale · fixed in `7974e2c`
- `apps/server/src/auth/event-repository.ts:15` `[adversarial|docs]` · old R9 wording ·
  fixed in `7974e2c`
- `README.md:89` `[adversarial]` · CIDR offered without its restriction · fixed in `7974e2c`
- `apps/server/src/app.test.ts`, `token-repository.test.ts`, `routes.test.ts` `[tests]` ·
  route cache policy, `revokeAllPending` and another account's reset not pinned · fixed in
  `7974e2c`
- `PROJECT_LOG.md:52` `[docs]` · historical `TRUST_PROXY=1` mention · superseded note in the
  `docs(log)` PR

## 🔵 Nice to Have

- `apps/server/src/config.ts:78` `[adversarial|tests]` · trailing comma refused · fixed
- `apps/server/src/index.ts:39` `[adversarial]` · untested warning · pure
  `trustProxyWarning` with tests

## ⚪ Disagree / Intentional

- `apps/server/src/config.ts` `[adversarial]` · `TRUST_PROXY=1` now refuses to start · spec §5
- `apps/server/src/auth/user-routes.ts:59,78` `[adversarial|design]` · an owner leaving
  revokes the other owners' links too · UC17, MCDA M1-B 440/500
- `apps/server/src/auth/token-repository.ts:76` `[adversarial]` · no revocation event · #90

## Per-dimension summary

- Adversarial: 1 Must + 4 Should in round 1, all fixed; gate open in round 2 · Design: sound,
  M1-B over-broad by design · Docs: stale copies fixed · Tests: four gaps filled ·
  Security: covered by the R12 review (`qa/2026-11-06-auth-security-review.md`) ·
  Correctness: no bug found
