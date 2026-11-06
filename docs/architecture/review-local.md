# Local review — popcorntv (#47 dev proxy target)

Pre-push review of the branch that reads the Vite `/api` proxy target from `API_URL`.

- Date: 2026-11-06
- Commit: fbdd8e4
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 2 rounds) · design · docs · tests · security · correctness
  (the last five folded into the adversarial pass: 4-file config and docs diff)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 1

## Adversarial review (#236)

- Round 1 on `50666d5`: Must 0 · Should 3 · Nice 2 · unverified 0 · Push gate: open
- Round 2 on `fbdd8e4`: 4 fixed · 1 not fixed (cosmetic wrap) · 0 regressed · new Must 0 ·
  **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot out of credit · Codex optional

## Pre-merge gate (head SHA fbdd8e4)

| Step         | Result                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| 0 CI mirror  | ✅ `ci.yml`: typecheck, lint, format:check, test, build; CodeQL, Scorecard, dependency-review CI-only          |
| 1 Tests      | ✅ shared 38 · server 497 · web 198                                                                          |
| 2 Coverage   | statements: web 99.1 % · server 97.6 % · shared 90.2 % (floor 80) · docs ⏸ deferred to the pre-merge run    |
| 3 SonarQube  | ⏸ deferred to the pre-merge run (`--push`)                                                                   |
| 4 Secrets    | ✅ gitleaks clean (origin/main..HEAD) · only `.env.example` tracked · diff read: nothing sensitive           |
| 5 E2E/smoke  | ⏸ deferred to the pre-merge run (`--push`)                                                                   |

- Gate: `--push`: **pre-push green**, SonarQube, doc coverage and E2E deferred

## 🔴 Must Have

_None._

## 🟡 Should Have

_None._ (Round 1: empty `API_URL` gave a 502, remote-host example, `API_URL` / `PORT` drift —
all fixed in fbdd8e4.)

## 🔵 Nice to Have

- `apps/web/vite.config.ts:20` `[adversarial]` · a whitespace-only `API_URL` still passes `||` ·
  `?.trim() ||` if ever needed; left out (YAGNI).
- `CLAUDE.md:55` `[docs]` · line wraps at 99 characters, wider than its neighbours · cosmetic.

## ⚪ Disagree / Intentional

- `apps/web/vite.config.ts:20` `[tests]` · no unit test: one expression in dev-only config,
  outside coverage and lint scope; behaviour checked live by the reviewer · KISS.

## Per-dimension summary

- Adversarial: 3 Should fixed, gate open · Design: one-line change, nothing to add · Docs:
  CLAUDE.md, README, `.env.example` agree with the code · Tests: none needed · Security: value
  from the developer's shell only, never bundled · Correctness: set / unset / empty verified.
