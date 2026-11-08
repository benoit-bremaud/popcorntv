# ADR-0021 — Logging policy, audit events logged by the event repository

- Status: accepted (brick #182, owner approval 2026-11-08)
- Date: 2026-11-08
- Deciders: owner
- Related: spec [logging](../specs/logging.md), ADR-0010, issue #182

## Context

The FULL QA pass of 2026-11-08 showed few domain logs and `LOG_LEVEL` ignored. The audit
events (`auth_events`, ADR-0010) were written to the database only, so `docker logs`
showed no sign-in, lockout or logout. The audit events had to reach the log as well, and
there were three places to do it.

## Options

A — `EventRepository.record` writes the row and the log line; B — every route that calls
`record` also logs; C — a generic Fastify `onResponse` hook logs the auth routes by status.

| Criterion                  | Weight | A                                   | B                         | C                                  |
| -------------------------- | -----: | ----------------------------------- | ------------------------- | ---------------------------------- |
| DRY, one source of truth   |     30 | 5 — one place                       | 2 — 19 duplicated calls   | 4 — one hook                       |
| Domain fidelity            |     25 | 5 — same event, same fields         | 5 — same                  | 2 — sees an HTTP status only       |
| Testability                |     20 | 5 — one unit test                   | 3 — one per route         | 3 — needs every route              |
| Simplicity                 |     15 | 4 — injects a logger                | 4 — plain calls           | 3 — status-to-event mapping        |
| No personal-data leak      |     10 | 5 — `usernameTried` dropped at once | 3 — easy to forget        | 4 — no body access                 |
| **Total**                  |    100 | **490**                             | **335**                   | **315**                            |

By hand: A = 150 + 125 + 100 + 60 + 50 = 490; B = 60 + 125 + 60 + 60 + 30 = 335;
C = 120 + 50 + 60 + 45 + 40 = 315. (The matrix shown in chat at approval read 345 / 300 by
an addition slip; the ranking is unchanged.)

Sensitivity: with simplicity at 30 and DRY at 15, A = 75 + 125 + 100 + 120 + 50 = 470
and still leads.

## Decision

A, plus the policy in the spec: `LOG_LEVEL` validated in `config.ts` and passed with the
redact paths through `loggerOptions`; one `http.request` line per answer instead of
Fastify's two; an `event` field on every domain line; `scripts/log-coverage.mjs` in
`pnpm lint`.

## Consequences

- The database and the log never disagree about an audit event; `usernameTried` stays in
  the owner-only table.
- A wrong `LOG_LEVEL` stops the start instead of logging at a level no one chose.
- A new `catch` that swallows an error fails the lint until it logs or says why not.
