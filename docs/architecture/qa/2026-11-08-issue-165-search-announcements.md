# QA record — #165 search and empty-state announcements

Fix verification for A11Y-03 / A11Y-14 of the 2026-11-08 Pi full pass; the automated layers are green, the screen-reader replay on staging is pending.

## Scope

- Library search: one `LiveStatus` polite region, *N results for "…"* / *No match for "…"*
  after a 500 ms typing pause, emptied at once when the query is cleared.
- Discover search: *Searching for "…"…*, the count, no match or the TMDB failure.
- Catalog loading and empty states: one region kept from loading, its text changes to
  *Nothing to watch yet.* or the owner welcome.

## Results

| Check | Layer | Result |
|---|---|---|
| Count, singular / plural, trimmed query | Vitest + Testing Library (`getByRole('status')`) | Pass |
| No match (library, Discover) | Vitest | Pass |
| Query cleared, blank query, blank Discover submit | Vitest | Pass |
| Rapid typing yields one announcement (fake timers) | Vitest | Pass |
| Discover in flight, then TMDB failure | Vitest | Pass |
| Empty catalog and welcome reuse the loading region | Vitest | Pass |
| Catalog smoke on the local prod build | Playwright `pnpm e2e` | Pass |
| Orca replay, `docs/testing/qa-matrix.md` § Search announcement checks | Staging | Pending |

## Pending

The staging database holds an owner whose password the agent does not have, so the
screen-reader replay waits for the owner's next QA pass on <https://localhost:8443>.
