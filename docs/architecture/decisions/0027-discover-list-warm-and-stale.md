# ADR-0027 — Warm the Discover lists at start and serve a stale list while it refreshes

- Status: accepted (owner chose C in the #257 chat, 2026-11-10)
- Date: 2026-11-10
- Deciders: owner
- Related: spec [discover-wishlist](../specs/discover-wishlist.md) R1, ADR-0020, issue #257

## Context

The owner saw "Loading…" for 15–20 s on a fresh load (QA PERF-01, 2026-11-10). Measured for
#257:

- Local staging (`make staging-up`, image of HEAD): after `docker restart`, `/health`
  answers in 1.4 s; migrations and configuration take about 20 ms. The scheduled scan
  (ADR-0016) first runs one interval after start, never at start.
- Pi, container started 2026-11-10T12:46:15Z: over its whole log, the only `http.request`
  lines above 3 s are four `GET /discover` at 4.3–6.2 s, the TMDB lists fetched after the
  15-minute memo (ADR-0020) expired. No home call (`/auth/status`, `/profiles`, `/libraries`,
  `/media`) is slow. The log of the earlier container is gone, so a home-page delay before
  that start cannot be measured.

The Discover rows already render one by one (each row has its own "Loading…"), so the wait
is the TMDB latency of the Pi, paid on the first visit after a start and after every
15-minute gap.

## Options

A — warm the four lists at start and refresh them every 14 minutes on a timer; B — serve an
expired list at once and refresh it behind the answer (stale-while-revalidate); C — A's
warm-up at start plus B, without a timer (B keeps the lists warm once they exist).

| Criterion           | Weight | A                                         | B                                                         | C                                  |
| ------------------- | -----: | ----------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| Wait removed        |     35 | 5 — never waits once warm                 | 3 — the first visit after every start or deploy waits 4–6 s | 5                                  |
| Simplicity          |     25 | 4 — a timer to start and stop on close    | 4 — an in-flight map                                      | 3 — an in-flight map and a warm-up |
| TMDB calls, Pi load |     20 | 3 — about 400 calls a day, visited or not | 5 — calls only on a visit                                 | 5 — B's calls plus four per start  |
| Risk                |     20 | 4                                         | 4 — a list may be one visit old                           | 4                                  |
| **Total**           |    100 | **415**                                   | **385**                                                   | **430**                            |

Sensitivity: with the other weights rescaled proportionally, C stays first while
simplicity weighs under about 35 (A overtakes it beyond). A first
scoring (B 4 on wait, C 4 on calls) gave B 420, C 410; the owner kept the rescored grid
above, as the first visit after a start is the reported symptom and four calls per start
are negligible.

## Decision

C, in `apps/server/src/discover/routes.ts`:

- A list younger than `LIST_TTL_MS` (15 min) is served as is. An older one is served at once
  and one TMDB call refreshes it; concurrent visits share the call in flight. A failed
  refresh logs `discover.list.refresh_failed` (warn) and the old list stays served.
- No list yet: the visit waits for TMDB, as before (502 `tmdb_unavailable` on failure).
- On `onReady`, when TMDB is configured, the four lists are fetched in the background; a
  failure logs `discover.list.warm_failed` (warn) and never blocks the start.
- No maximum age: during a TMDB outage the last known list beats an error.

## Consequences

- The first Discover visit after a start (past the warm-up, a few seconds) and every later
  visit answer from memory. While TMDB answers, a stale list is at most one visit old (during an outage it keeps its
age); "Available" and the
  wishlist state are joined per request, so they stay exact.
- TMDB is called four more times per start; otherwise the call rate is ADR-0020's.
- The home-page delay seen before the Pi container restart stays unexplained; QA check
  "Deploy parity and data checks" step 2 records the slowest `/api` call on every deploy.
