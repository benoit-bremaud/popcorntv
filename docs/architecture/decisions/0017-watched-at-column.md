# ADR-0017 — Watched marks stored as `watch_progress.watched_at`

- Status: accepted (owner chose A in the #131 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [watched-marks](../specs/watched-marks.md), ADR-0007, issue #133

## Context

A title is finished only past 90 % of a known duration. A viewer must also mark a title
watched (or not) by hand, including files whose duration is unknown.

## Options

A — a nullable `watched_at` column on `watch_progress`, `finished = watched_at set or ≥ 90 %`,
unwatched deletes the row; B — fake it by saving the position at the duration; C — a
separate `watched` table.

| Criterion   | Weight | A                                   | B                                 | C                                   |
| ----------- | -----: | ----------------------------------- | --------------------------------- | ----------------------------------- |
| Correctness |     40 | 5 — works with an unknown duration  | 2 — impossible without a duration | 5 — works with an unknown duration  |
| Simplicity  |     35 | 4 — one column, one migration       | 5 — no migration                  | 2 — a table, a join, its own routes |
| Consistency |     25 | 5 — every reader keeps `finished`   | 3 — a lie in `position_sec`       | 3 — two sources for one state       |
| **Total**   |    100 | **465**                             | **330**                           | **345**                             |

Sensitivity: with weights 30 / 50 / 20, A (450) still leads B (370) and C (310).

## Decision

A, migration `0007_watched-marks`. Marking watched keeps the position; unwatched forgets it.

## Consequences

- Continue watching, the resume offer and the posters read one flag: `finished`.
- A rewatch keeps the title watched until it is unmarked.
