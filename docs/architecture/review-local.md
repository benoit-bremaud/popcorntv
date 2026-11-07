# Local review — popcorntv (#132 scheduled scan)

- Date: 2026-11-07
- Commit: b1b926f
- Scope: branch diff origin/main...feat/132-scheduled-library-scan
- Checks run: adversarial (Opus, 3 rounds) · design · docs · tests · security · correctness
- Verdict: ship · Must 0 · Should 1 (deferred) · Nice 5 (deferred)

## Adversarial review (#236)

- Round 1 on `1a1bdc2`: Must 0 · Should 5 · Nice 5 · Push gate: open
- Round 2 on `419c8b5`: 4 fixed · 1 partly fixed · new Must 1 (FFmpeg killed only after the
  in-flight scan on close) · Push gate: closed
- Round 3 on `b1b926f`: all fixed · new Must 0 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex optional

## Pre-merge gate (head SHA b1b926f)

| Step | Result |
|---|---|
| 0 CI mirror | typecheck, lint, format, test, build green locally on tracked files; CodeQL, Scorecard, dependency review CI-only |
| 1 Tests | ✅ shared 38 · server 557 · web 235 (pre-existing flaky `subtitle-extractor` timeout seen once in 9 runs) |
| 2 Coverage | server 97.45 % stmts / 93.34 % branches / 96.32 % funcs / 98.54 % lines · web 99.05 % · shared 90.24 % · docs ⏸ deferred to the pre-merge run |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) |

- Gate: `--push`: **pre-push green**, SonarQube, E2E and doc coverage deferred

## 🔴 Must Have

_None._

## 🟡 Should Have

- `apps/server/src/app.ts:271` `[adversarial|tests]` · no test pins "kill FFmpeg before awaiting
  the scan" on close · follow-up test with a blocked probe and a `kill` spy

## 🔵 Nice to Have

- `apps/server/src/config.ts:118` `[correctness]` · `Number()` accepts `0x10` or `1e1` as minutes
- `apps/server/src/app.ts:251` `[correctness]` · `buildApp` does not bound `scanIntervalMin`
- `docs/architecture/specs/scheduled-scan.md` `[docs]` · owner 409 while a scheduled run holds the lock
- `docs/requirements/02-homelab-ecosystem.md:139` `[docs]` · point "rescan by hand" to #132
- `apps/server/src/config.ts:116` `[security]` · warn when an invalid value falls back to 60

## ⚪ Disagree / Intentional

- `apps/server/src/library/scheduler.ts` `[adversarial]` · a tick during a run is dropped, not
  queued · spec R4

## Per-dimension summary

- Adversarial: 1 Must found and fixed in round 2, gate open in round 3 · Design: flat, no
  over-engineering · Docs: spec, ADR-0016, diagrams, CLAUDE.md aligned · Tests: stop, overlap,
  unref and interval 0 now pinned · Security: no new route, input or egress · Correctness:
  deleted-library and shutdown races closed
