# ADR-0020 — Discover goes through the server, wishlist in its own table

- Status: accepted (brick #127, owner brainstorm 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [discover-wishlist](../specs/discover-wishlist.md), ADR-0003, issue #127

## Context

Discover shows TMDB titles that are not on disk, with posters, and a per-profile wishlist
that must say when a title has arrived. The server's only HTTP egress is the TMDB client
(ADR-0003); the API key must never reach the browser.

## Options

A — server routes over the existing TMDB client, posters downloaded lazily through the
artwork cache by a poster route, wishlist in a `wishlist` table, availability joined on
`media.tmdb_id` at read time; B — the same routes but every poster of a list cached before
the list answers; C — the browser calls TMDB and `image.tmdb.org` directly, the wishlist
stored as `watch_progress`-like rows on fake media.

| Criterion        | Weight | A                                         | B                                       | C                                           |
| ---------------- | -----: | ----------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Security/privacy |     35 | 5 — one egress, key and viewer IP hidden  | 5 — same                                | 1 — key in the browser, IP leaked to TMDB    |
| Responsiveness   |     25 | 4 — list answers at once, posters stream  | 2 — first list waits for 20 downloads   | 4 — direct, but no cache                     |
| Simplicity       |     25 | 4 — two route modules, one table          | 4 — same, plus a fan-out                | 2 — fake media rows pollute the catalog      |
| Consistency      |     15 | 5 — reuses client, cache and FK cascade   | 5 — same                                | 1 — bypasses the component diagram           |
| **Total**        |    100 | **450**                                   | **400**                                 | **200**                                      |

By hand: A = 35×5 + 25×4 + 25×4 + 15×5 = 175 + 100 + 100 + 75 = 450; B = 175 + 50 + 100 +
75 = 400; C = 35 + 100 + 50 + 15 = 200.

Sensitivity: with weights 20 / 30 / 30 / 20, A = 100 + 120 + 120 + 100 = 440, B = 100 +
60 + 120 + 100 = 380, C = 20 + 120 + 60 + 20 = 220. A leads under both weightings.

## Decision

A. Migration `0008_wishlist`; module `src/discover/` (`wishlist-repository`, `routes`);
the TMDB client gains `list` and `searchTitles`; lists are memoised 15 minutes in the
routes so a page load costs at most four TMDB calls per quarter hour.

## Consequences

- Availability needs no scan hook: it is a join, always current.
- Discover posters share `ARTWORK_DIR` with library artwork (digest names, no collision);
  the folder grows with browsing, bounded by what viewers open.
- Without `TMDB_API_KEY` the Discover rows show a muted line; My list still loads.
