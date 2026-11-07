# Local review — popcorntv (feat/123-library-management-web)

Pre-push review of #123 (library management from the web app) with #122 folded in.

- Date: 2026-11-07
- Commit: da2e8ec (+ this report)
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 4 rounds) · design (architecture-guardian) · docs (through
  design and adversarial) · tests (test-auditor) · security and correctness (through the
  adversarial review)
- Verdict: ship · Must 0 · Should 0 · Nice 4

## Adversarial review (#236)

- Round 1 on `543915e`: Must 3 · Should 4 · Nice 5 · unverified 1 · Push gate: closed
- Round 2 on `880374d`: all 3 Must fixed · new Should 3 · Push gate: open
- Round 3 on `819dc69`: 5 fixed · 0 regressed · new Must 0 · Push gate: open
- Round 4 on `da2e8ec`: 3 SonarQube fixes verified · 0 regressed · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex quota refused (PR #129, 2026-11-07)

## Pre-merge gate (head SHA da2e8ec)

| Step         | Result                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| 0 CI mirror  | ✅ `ci.yml`: typecheck, lint, format:check, test, build all green locally; CodeQL, Scorecard, dependency-review CI-only |
| 1 Tests      | ✅ 800 (shared 38, server 542, web 220)                                                                |
| 2 Coverage   | server 97.4 % stmts / 93.4 % branches · web 98.0 % / 92.3 % · docs ⚠️ no doc-coverage counter in this repo   |
| 3 SonarQube  | ✅ PASSED (new coverage 95.0 %, 0 new issues, 0 % duplication)                                                                       |
| 4 Secrets    | ✅ gitleaks clean on origin/main..HEAD · only `.env.example` tracked · diff read: nothing sensitive    |
| 5 E2E/smoke  | ✅ Playwright catalog smoke 1/1                                                                       |

- Gate: **local gate green except doc coverage (no counter)**; GitHub Actions disabled on the
  repo, so the merge needs the owner's `MERGE_GATE_WAIVER`.

## 🔴 Must Have

- _None._ (Round 1: ADR-0014 §1 totals wrong → corrected, owner re-decided C on the true
  totals; auth spec §4.4 missing the new owner routes; `CLAUDE.md` layout missing
  `folder-lister` — all fixed.)

## 🟡 Should Have

- _None._ (Fixed: overlap check on real paths, concurrent-add race, admin API client tests,
  spec/UI alignment, reasons per MCDA score, folder list marks overlapping folders taken,
  accurate doc comments, stronger route tests.)

## 🔵 Nice to Have

- `apps/server/src/library/routes.test.ts` `[adversarial]` · the concurrent-add test may pass
  on the pre-fix code too · inject a slow `realpath` to prove the re-read.
- `apps/server/src/library/routes.ts` `[design|adversarial]` · unreachable 404 after
  `renameLibrary` · keep as a defensive check.
- `apps/web/src/auth/LibrarySection.tsx` `[design|adversarial]` · library UI lives in `auth/`
  and is ~320 lines · split `LibraryRow` / `AddLibraryForm` into `src/library/` when it grows.
- `apps/web/src/auth/AuthGate.tsx` `[adversarial]` · no test that only an owner receives
  `openAdmin` · the server enforces owner-only on every route.

## ⚪ Disagree / Intentional

- `docs/architecture/specs/deploy-homelab.md` `[adversarial]` · #125 line dropped on purpose
  (#125 closed, no Jellyfin history).
- `apps/server/src/playback/session-routes.test.ts` `[tests]` · the helper reuses the library:
  required by R3 (one library per root).
- ADR-0014 §1 effort re-scored once C was written · written down openly, owner re-decided.

## Per-dimension summary

- Adversarial: 3 rounds, gate open. · Design: no defect, no over-engineering. · Docs: comments
  and specs aligned. · Tests: trustworthy, Shoulds fixed. · Security: owner-only routes, 403
  tested, CSRF covers PATCH/DELETE, prototype poisoning still refused. · Correctness: race
  closed, cascade under the lock.
- Out of scope (pre-existing): ADR index in `docs/architecture/README.md` stops at 0002;
  `CLAUDE.md` repo-visibility line predates ADR-0005; `POST /libraries` does not check the root
  exists (scan reports `root_unreadable`).
