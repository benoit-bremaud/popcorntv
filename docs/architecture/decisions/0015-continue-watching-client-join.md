# ADR-0015 — Continue-watching row joined in the browser

- Status: accepted (owner chose A in the #131 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [continue-watching](../specs/continue-watching.md), ADR-0004, ADR-0007,
  issue #131

## Context

The home view needs a row of the active profile's titles in progress, with the next
episode of a series after a finished one. `GET /profiles/:profileId/progress` already
returns every position (newest first, with `finished`), the web already holds the full
catalog (episodes included), and `nextEpisode` / `resumeAt` already encode the rules.

## Options

A — a pure `continueWatchingRow(media, progress)` in `catalog.ts`; B — a new route `GET
/profiles/:profileId/continue-watching`; C — enrich `GET /progress` with the series and
next episode.

| Criterion   | Weight | A                                   | B                                       | C                              |
| ----------- | -----: | ----------------------------------- | --------------------------------------- | ------------------------------ |
| Simplicity  |     30 | 5 — one pure function, no route     | 2 — route, contract, tests              | 3 — wider contract, one user   |
| Reuse       |     25 | 5 — `nextEpisode`, `resumeAt` reused | 2 — next-episode rule duplicated server | 3 — partly duplicated          |
| Performance |     15 | 4 — O(n) over data already loaded   | 5 — SQL                                 | 4 — SQL, larger payload        |
| Security    |     15 | 5 — no new surface                  | 3 — new route to guard                  | 4 — wider payload              |
| Testability |     15 | 5 — unit test of a pure function    | 4 — route test with a database          | 4 — route test with a database |
| **Total**   |    100 | **485**                             | **290**                                 | **345**                        |

Sensitivity: with performance weighted 40 (others scaled down), A still leads. Scores are
estimates; the facts (route, repository order, catalog content) were checked in the code.

## Decision

A. The page loads the progress next to the catalog, reloads it when the detail dialog
closes, and computes the row in the browser.

## Consequences

- No server change, no new contract.
- If the catalog ever stops being loaded whole (pagination), the join moves to the
  server (option B) — revisit then.
