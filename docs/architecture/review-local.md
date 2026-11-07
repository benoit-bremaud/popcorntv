# Local review — popcorntv (#133 watched marks)

Pre-push and pre-merge review of the watched / unwatched mark (issue #133, ADR-0017).

- Date: 2026-11-07
- Commit: b20f75b
- Scope: branch diff origin/main...feat/133-watched-marks
- Checks run: adversarial (Opus, 2 rounds) · combined design / docs / tests / security review (Sonnet)
- Verdict: ship · Must 0 open · Should 0 open · Nice 4 (deferred)

## Adversarial review (#236)

- Round 1 on `d8ea81e`: Must 1 (finished rule stated two ways in resume-playback R4 and the
  class note) · Should 6 (parity row, component routes, UC23 in the auth note, CLAUDE.md,
  series toggle tests, rewatch test) · Nice 3 · Push gate: closed
- Round 2 on `b20f75b`: all Must and Should fixed · new Must 0 · **Push gate: open**
- Hosted reviewers: Copilot out of credit · Codex optional

## Combined review (Sonnet)

- Must 0 · Should 5: `setWatched` not atomic (fixed `d8ea81e`, one transaction), refusal
  tests for DELETE (fixed), refused-mark web test (fixed), repository unit test and diagram
  check (covered through routes; diagrams fixed in round 1) · Nice 6 deferred.

## Pre-merge gate (head SHA b20f75b)

| Step | Result |
|---|---|
| 0 CI mirror | typecheck, eslint, prettier on tracked files, build green; CodeQL, Scorecard, dependency review CI-only (Actions disabled) |
| 1 Tests | ✅ shared 38 · server 567 · web 246 |
| 2 Coverage | server 97.5 % stmts / 93.48 % branches · web 99.07 % · shared 90.24 % |
| 3 SonarQube | ✅ quality gate PASSED |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ catalog smoke 1 passed |

- Gate: **green**

## 🔵 Nice to have (deferred)

- Spec summary says an episode can be marked; the UI offers the toggle on films and series only.
- A refused mark gives no visible feedback (matches spec 2a).
- New web test names use "shows…" / "offers…" instead of "should…".
- `watchedIds` is O(items × media) for series; fine at current scale.
