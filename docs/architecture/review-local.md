# Local review — popcorntv (#134 progress carry-over)

Pre-push and pre-merge review of the progress carry-over at scan (issue #134, ADR-0018).

- Date: 2026-11-07
- Scope: branch diff origin/main...feat/134-progress-survives-path-change
- Checks run: combined design / docs / tests / security review (Sonnet)
- Adversarial review (Opus): deferred to one pass over the #134–#136 stack after #136
  (owner rule 2026-11-07)
- Verdict: ship · Must 0 · Should 6 fixed or recorded · Nice 4 deferred

## Combined review (Sonnet)

- Must 0
- Should 6, all addressed: carry-over skipped when nothing is missing; watched mark kept on
  either side recorded in R4 as an accepted edge case; deliberate delete beside a kept copy
  recorded in R3; title key NFC-normalised; CLAUDE.md current state; R1 / R5 duplicate
  sentence removed
- Nice 4 deferred: ADR-0018 sensitivity weights, kind prefix on the TMDB key, `it.each`
  labels in `scanner.test.ts`, no security finding

## Pre-merge gate

| Step | Result |
|---|---|
| CI mirror | typecheck, eslint, prettier on tracked files, build green; CodeQL, Scorecard, dependency review CI-only (Actions disabled) |
| Tests and coverage | Vitest green; statements shared 90.2 % · server 97.5 % · web 99.1 % |
| E2E smoke | Playwright catalog smoke green |
| SonarQube | quality gate passed |
| Secrets | gitleaks on origin/main..HEAD: no leaks |
