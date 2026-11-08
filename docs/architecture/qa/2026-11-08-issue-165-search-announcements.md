# QA record — #165 search and empty-state announcements

Fix verification for A11Y-03 / A11Y-14 of the 2026-11-08 Pi full pass; the automated layers and the DOM replay on local staging are green, a listening pass with a real screen reader is pending.

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
| Live-region replay of § Search announcement checks | Staging `b7cbdfb`, Playwright Chromium | Pass (below) |
| Listening pass with Orca | Staging | Pending |

## Staging replay

Local staging (`make staging-up`, image `popcorntv:staging-b7cbdfb`), account `qa-tester`
created by the agent from a server-issued invitation (credentials in the git-ignored
`.env.staging`, `QA_TESTER_*`), library *QA films* on the two mounted test films. The text
of every `role="status"` node was read after each step:

| Step | Region text | Result |
|---|---|---|
| Viewer, empty catalog | `Nothing to watch yet.` | Pass ([01](2026-11-08-issue-165-search-announcements/01-viewer-empty-catalog.png)) |
| Owner, empty catalog | `Welcome to PopCornTV. Add a library from your media folder, then scan it.` | Pass ([01](2026-11-08-issue-165-search-announcements/01-owner-welcome.png)) |
| Library before any search | empty, one region | Pass |
| Type `heat` fast (120 ms per key) | empty after every key | Pass |
| 700 ms later | `1 result for “heat”` | Pass ([02](2026-11-08-issue-165-search-announcements/02-library-results.png)) |
| Query `a` | `2 results for “a”` | Pass |
| Query `zzzqqq` | `No match for “zzzqqq”`, visible line `No title or person matches “zzzqqq”.` | Pass ([03](2026-11-08-issue-165-search-announcements/03-library-no-match.png)) |
| Escape | empty at once | Pass |
| Blank query | empty | Pass |
| Discover before search | empty, one region | Pass |
| Discover search (staging TMDB key is a placeholder) | `TMDB could not be reached.`, emptied when the field is cleared | Pass ([04](2026-11-08-issue-165-search-announcements/04-discover-results.png)) |

Not replayed on staging: the Discover count and no-match lines, which need a real TMDB key;
Vitest covers both.

## Pending

A listening pass with Orca on Firefox, by the owner, of `docs/testing/qa-matrix.md`
§ Search announcement checks.
