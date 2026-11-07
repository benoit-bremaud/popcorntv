# ADR-0014 — Library management in the web app

- Status: accepted (owner chose C, A, A, A in the #123 chat, 2026-11-07; §1 re-decided on
  corrected totals the same day)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [library-management](../specs/library-management.md), ADR-0002,
  ADR-0010, issues #123, #122

## Context

Libraries could only be created and scanned with the API (#60 deployment). Plex and
Jellyfin offer a first-run wizard, a server-side folder picker, a fixed library type,
manual and scheduled scans with a progress bar, a metadata refresh, and rename / delete.
Netflix configures nothing: the catalog is simply full. Four choices were made with an
MCDA matrix each (scores 0–5, weights /100, totals /500; scores are estimates, facts
checked in the code: cascade deletes exist, Caddy sets no proxy timeout, a per-library
lock already refuses overlapping scans).

## 1. Folder choice

A — server-side tree browser under `MEDIA_ROOT`; B — typed path only; C — the direct
sub-folders of `MEDIA_ROOT` plus a typed path.

| Criterion  | Weight | A                              | B                                     | C                                         |
| ---------- | -----: | ------------------------------ | ------------------------------------- | ----------------------------------------- |
| Security   |     35 | 4 — new route reads the tree   | 5 — no new route                      | 4 — owner-only route, one level, no links |
| UX         |     30 | 5 — click anywhere             | 2 — container path to guess (#60 bug) | 4 — one click for `films/`, `series/`     |
| Simplicity |     20 | 3 — recursive navigation       | 5 — nothing to add                    | 4 — one `readdir`                         |
| Effort     |     15 | 2 — still to write             | 4 — remove the written route and list | 5 — written and tested                    |
| **Total**  |        | **380**                        | **395**                               | **415**                                   |

Points: A = 140+150+60+30 · B = 175+60+100+60 · C = 140+120+80+75.

Correction: the first matrix shown to the owner gave A 395, B 400, C 400 with effort
scores 3 / 5 / 4; the true totals were A 395, B 410, C 400, so B led. Effort measures the
work left; once C was written and tested it was re-scored (A 2, B 4, C 5), the other
scores unchanged, and the owner chose again on the totals above.

Sensitivity: B overtakes C only when security weighs about half the total; A only when UX
passes about 45. **C chosen**: it covers the real layout in one click and avoids the
typed-path error made during #60.

## 2. Scan progress

A — synchronous request with a busy state; B — background job, 202, polling.

| Criterion  | Weight | A                                       | B                             |
| ---------- | -----: | --------------------------------------- | ----------------------------- |
| UX         |     35 | 3 — report lost if the tab closes       | 5 — state survives a reload   |
| Simplicity |     30 | 5 — contract unchanged                  | 3 — job state + polling route |
| Robustness |     20 | 4 — Caddy sets no timeout; scan carries | 5 — no long request           |
| Effort     |     15 | 5 — web only                            | 2 — lock, contract, tests     |
| **Total**  |        | **410**                                 | **395**                       |

Points: A = 105+150+80+75 · B = 175+90+100+30.

Sensitivity: B leads once UX outweighs simplicity by about 13 points. **A chosen**: the
scan finishes server-side even if the tab closes, the contract and the deploy command
stay; B is the issue to open when scans last minutes.

## 3. Scope

A — list, add, scan, refresh, rename, delete; B — A without delete; C — A plus scheduled
scans.

| Criterion | Weight | A                              | B                           | C                          |
| --------- | -----: | ------------------------------ | --------------------------- | -------------------------- |
| Value     |     40 | 5 — every goal of the owner    | 4 — a wrong library sticks  | 5 — plus automation        |
| Risk      |     30 | 4 — delete under the lock      | 5 — nothing destructive     | 2 — timers in the server   |
| PR size   |     30 | 4                              | 4                           | 1 — two features in one PR |
| **Total** |        | **440**                        | **430**                     | **290**                    |

Points: A = 200+120+120 · B = 160+150+120 · C = 200+60+30.

**A chosen**: the cascade makes delete one statement under the lock; without it a
mistaken library stays forever.

## 4. First run

A — welcome panel on an empty catalog for the owner; B — multi-step wizard; C — admin
panel only.

| Criterion  | Weight | A                                  | B                                | C                        |
| ---------- | -----: | ---------------------------------- | -------------------------------- | ------------------------ |
| UX         |     50 | 4 — one obvious button             | 5 — guided                       | 2 — owner must find it   |
| Simplicity |     50 | 5 — one empty state                | 2 — a step machine for one step  | 5 — nothing to add       |
| **Total**  |        | **450**                            | **350**                          | **350**                  |

Points: A = 200+250 · B = 250+100 · C = 100+250.

**A chosen**: the account already exists (setup link, ADR-0010); only libraries remain.

## Consequences

- New owner routes `GET /libraries/folders`, `PATCH /libraries/:id`, `DELETE
  /libraries/:id`; new error code `root_in_use` (roots compared on real paths).
- The JSON body parser treats an empty body as no body (#122).
- Follow-up issues: scheduled scan, background scan with progress.
