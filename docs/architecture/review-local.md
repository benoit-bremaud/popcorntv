# Local review — popcorntv (fix/74-per-account-transcode-slot)

Pre-push review of #74: transcode slot take-over at the `TRANSCODE_MAX_SESSIONS` limit.

- Date: 2026-11-06
- Commit: 4b4adcd
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 3 rounds) · design · docs · tests · security · correctness
- Verdict: ship as-is · Must 0 · Should 0 · Nice 2

## Adversarial review (#236)

- Round 1 on `e391500`: Must 5 · Should 3 · Nice 3 · unverified 0 · Push gate: closed
- Round 2 on `ac5f92b`: 9 fixed · 1 partly fixed (ADR-0012 sensitivity) · new Should 1
  (take-over before the no-video check) · Push gate: closed
- Round 3 on `4b4adcd`: all fixed · new Must 0 · **Push gate: open**
- Round 4 on `762e92f` (Codex finding on #107, playlist check vs take-over): fixed ·
  new Must 0 · **Push gate: open**
- Hosted reviewers: Copilot out of credit · Codex posted on `2048c89` (1 P2, fixed in `762e92f`)

## Pre-merge gate (head SHA 4b4adcd)

| Step         | Result                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 0 CI mirror  | ✅ `ci.yml`: typecheck, lint, format:check, test, build all green locally; CodeQL, Scorecard, dependency-review CI-only        |
| 1 Tests      | ✅ shared 38 · server 520 · web 199                                                                                            |
| 2 Coverage   | ⏸ deferred to the pre-merge run (`--push`); reviewer measured server 97.6 % statements, 93.5 % branches                        |
| 3 SonarQube  | ⏸ deferred to the pre-merge run (`--push`)                                                                                     |
| 4 Secrets    | ✅ gitleaks clean (origin/main..HEAD) · only `.env.example` tracked (placeholders) · diff read: ids and roles in logs only     |
| 5 E2E/smoke  | ⏸ deferred to the pre-merge run (`--push`)                                                                                     |

- Gate: `--push`: **pre-push green** — steps 2, 3, 5 deferred (never GREEN)

## 🔴 Must Have

_None._ (Round 1: ADR-0012 totals, ADR-0006 §6 not marked amended, sequence diagram 02,
state diagram 05 entry label, `.env.example` / `config.ts` comments — all fixed.)

## 🟡 Should Have

_None._ (Fixed: own-before-viewer and oldest-first tests, `Session.owner` comment, 502 on a
take-over during `Starting`, playability checked before any take-over.)

## 🔵 Nice to Have

- `apps/server/src/playback/session-manager.ts:125` `[adversarial]` · the `args === null`
  branch is now unreachable (checked at the top) · keep as a type guard or throw.
- `apps/server/src/playback/session-manager.test.ts:145` `[adversarial|tests]` · the
  `if (viewer.kind === 'ready')` guard can pass vacuously · assert the kind first.

## ⚪ Disagree / Intentional

- `apps/web/src/playback/PlayerDialog.tsx:27` `[adversarial]` · a viewer taken over sees
  *This file could not be played* · no dedicated error code by design (ADR-0012).
- `session-manager.ts:99` `[adversarial]` · a Play during another open's `starting` window
  gets `busy` · the "counted before the first await" invariant holds (spec §4).

## Per-dimension summary

- Adversarial: docs drift fixed over three rounds; code sound · Design: `Opener` now
  `Pick<Caller>` · Docs: spec, ADRs, diagrams aligned · Tests: ordering and take-over cases
  added · Security: role from the server-side `Caller`, no cross-account read · Correctness:
  slot accounting exact, no-video checked first.
