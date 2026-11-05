# Local review — popcorntv (#18 accounts and sessions — design)

Pre-push review of branch `feat/18-user-accounts-auth` (conception only, no code).

- Date: 2026-11-05
- Commit: 8b606f5 (reviewed), fixes in 430e846, c784ad7, 60aa08c, 9c831d3
- Scope: branch diff `main...HEAD` (`docs/architecture/specs/auth.md`,
  `docs/architecture/decisions/0010-accounts-and-sessions.md`,
  `docs/architecture/diagrams/auth/*`, profiles spec / ADR-0008 / profiles sequence
  updates)
- Checks run: adversarial (Opus, 5 rounds) · design · correctness (owner self-review).
  Docs-only diff: tests and container auditors not applicable; security covered by the
  adversarial rounds.
- Verdict: ship as-is · Must 0 · Should 0 · Nice 0 open

## Adversarial review (#236)

- Round 1 on `8b606f5`: Must 4 · Should 13 · Nice 10 · unverified 1 · Push gate: closed
- Round 2 on `430e846`: all round 1 fixed · new Must 1 · Should 1 · Nice 7 · closed
- Round 3 on `c784ad7`: all fixed · Must 0 · Should 2 · Nice 4 · open
- Round 4 on `60aa08c`: all fixed · Must 0 · Should 1 · Nice 2 · open
- Round 5 on `9c831d3`: all fixed · Must 0 · Should 0 · Nice 0 · **Push gate: open**
- Hosted reviewers (filled at the pre-merge run): Copilot cannot be requested on this
  repo · Codex: no review posted on this PR (optional)

## Pre-merge gate (head SHA c50aa0f, main merged in)

| Step | Result |
| --- | --- |
| 0 CI mirror | `ci.yml`: typecheck ✅, test ✅, build ✅; lint / format:check ⚠️ red locally only on the ignored `.claude/worktrees/zen-ptolemy-*` checkout (0 finding outside it; a clean CI checkout has no such folder); CodeQL, Scorecard, dependency-review CI-only |
| 1 Tests | ✅ shared 31 · server 334 · web 129 |
| 2 Coverage | tests: server 98.3 % stmts / 95.6 % branches / 95.6 % funcs / 98.4 % lines; web 99.8 / 93.4 / 100 / 100; shared 88.9 / 100 / 100 / 86.7 · docs: no code export (docs-only change) |
| 3 SonarQube | ✅ PASSED |
| 4 Secrets | ✅ gitleaks clean on `origin/main..HEAD` · tracked env: `.env.example` only (placeholders) · diff read: nothing sensitive |
| 5 E2E/smoke | ✅ catalog smoke 1/1 (fixed by #65) · QA pass: not applicable (docs-only change) |

- Gate: **GREEN** on `c50aa0f`; the next commit changes only this report.
- Mermaid: the 7 auth diagrams and the profiles sequence render with `mmdc` 11.4.2,
  no syntax error.

## 🔴 Must Have

_None open._ Fixed across rounds (main ones):

- `specs/auth.md` `[adversarial]` · `PUBLIC_URL` undefined when unset → required, dev
  value, one origin for every client.
- `specs/auth.md` §5 `[adversarial|design]` · Fastify did not serve the web build and
  the Caddy recipe could not work → Caddy serves the build, strips `/api`, `handle`
  blocks (reproduced on `caddy:2.11.7-alpine`); new `08-deployment-prod.md`.
- `decisions/0008-profiles.md`, `specs/profiles.md` `[adversarial]` · UC9 ownership
  stated two ways → ADR-0008 §4 superseded by ADR-0010 §5, per-user profile rules.
- `diagrams/auth/04-class.md` `[adversarial|design]` · `profiles.user_id` nullability
  contradicted → one wording.
- `specs/auth.md` R10, `specs/profiles.md` `[design|adversarial]` · global profile name
  index / limit / last-profile rule → per user, `(user_id, name_key)` unique.
- `specs/auth.md` R1 `[design|adversarial]` · URL-string allow-list → route
  `config.access`, protected by default.
- `diagrams/auth/02-sequence-sign-in.md` `[design]` · per-route session checks → one
  `onRequest` hook participant.
- `specs/auth.md` §4.5 `[design]` · `auth` ↔ `profiles` cycle → `Caller` in
  `src/http.ts`, narrow `Pick` port.
- `diagrams/auth/01-use-case.md` `[design]` · wrong «include», missing goals → UC19,
  UC20, actor generalization.

## 🟡 Should Have

_None open._ Fixed: atomic single-use token consumption (kind in the `UPDATE`), rate
limits on every hashing route and a bounded hash concurrency cap, revocable invitations,
user-bound playback sessions, role read on every request, Docker `HOST` / compose port,
SEC-11/12/15 in the QA scope, CSRF claim wording, setup token kept in memory, hourly
`last_seen_at` slide, purge without a timer, class diagram names and links, rotated
cookie on password change, session-state revocation causes.

## 🔵 Nice to Have

_None open._ Fixed: `__Host-` cookie, reset TTL 24 h, one lockout event per window,
`username_tried` syntax filter, ASCII usernames and NFC passwords, `last_login_at`,
HSTS and CSP in Caddy, `rootPath` decision recorded, event kinds completed, no session
fixation, 20-session cap, hashing outside the synchronous transaction (self-review).

## ⚪ Disagree / Intentional

- `specs/auth.md` §7 `[adversarial]` · email, TOTP and homelab deployment split out of
  #18 · owner decision (#18 chat, 2026-11-05), follow-up issues filed.
- `specs/auth.md` §4.4 `[adversarial]` · `rootPath` visible to viewers · recorded, to
  revisit in the post-#18 security audit.
- `[design]` · audit log, no session/JWT library, hasher without interface, one
  `auth_tokens` table, 404 instead of 403 cross-user · intentional (issue scope,
  ADR-0003 precedent, single-egress modules).

## Out of scope (pre-existing)

- `CLAUDE.md:84`, `apps/web/src/profiles/ManageProfiles.tsx:43` — "open to the network
  until #18": update in the implementation PR.
- `docs/architecture/README.md:39-48` — feature and ADR index stale: follow-up issue.

## Per-dimension summary

- Adversarial: 5 rounds, 0 open, gate open · Design: 6 Must / 8 Should / 7 Nice all
  applied, five ADR decisions confirmed sound · Correctness: self-review added 5 fixes
  · Security: covered by the adversarial rounds, design follows OWASP session and
  password guidance · Docs / tests / containers: not applicable to a design-only diff.
