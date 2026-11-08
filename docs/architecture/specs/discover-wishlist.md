# UC26 — Discover titles and keep a wishlist

A viewer browses titles from TMDB beyond the local library, opens a title sheet, sees
whether the title is already on disk, and keeps a per-profile wishlist whose entries turn
"available" once a scan finds the file.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md),
> [components](../diagrams/catalog/03-component.md)
> **Issue**: #127 (search: #165, #166) · **Related ADRs**: ADR-0003, ADR-0008, ADR-0016, ADR-0020
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** A **Discover** tab next to **Library** shows four TMDB rows — trending films,
  trending series, popular films, popular series — and the profile's **My list** row first
  when it is not empty. `GET /discover?list=trending|popular&kind=movie|tv` answers at
  most 20 `DiscoverTitle`s; a list is kept in memory for 15 minutes.
- **R2** A search field queries `GET /discover/search?q=` (1–100 characters, TMDB
  `/search/multi`, films and series only, at most 20). Like the library search, it is
  live (#166): the trimmed query goes out 400 ms after the last keystroke, Enter sends it
  at once, an unchanged query is not re-sent unless its last attempt failed (Enter or the next
  pause retries it), a blank one is never sent, nothing goes out while an input method composes,
  an answer for an older query is dropped, and Escape clears the field. Each search is
  announced as it starts and ends; the 400 ms pause already groups the keystrokes. The `LiveStatus` region announces
  *Searching for "…"…*, then *N results for "…"*, *No match for "…"* or the TMDB
  failure; it empties when the field is cleared (#165).
- **R3** Opening a title shows its sheet: poster, year, rating, synopsis, genres and the
  first ten cast names (`GET /discover/:kind/:tmdbId`).
- **R4** Every `DiscoverTitle` carries `mediaId`: the id of the local `film` (for `movie`)
  or `series` (for `tv`) row with the same `tmdb_id`, else null. When set, the card and the
  sheet show **In my library** and the sheet offers **Play in my library**, which opens the
  library's detail dialog (UC4) where Play lives. Nothing else is ever played.
- **R5** **+ My list** / **✓ In my list** (a toggle, `aria-pressed`) stores or forgets the
  title for the active profile: `PUT | DELETE /profiles/:profileId/wishlist/:kind/:tmdbId`
  → `204`. The server reads the title, year, synopsis, rating and poster path from TMDB
  itself; the client sends no title data.
- **R6** `GET /profiles/:profileId/wishlist` lists the entries newest first, each with its
  `mediaId` (R4) computed at read time: an entry becomes **Available** as soon as a scan
  (manual or scheduled, ADR-0016) and its enrichment give a media that `tmdb_id`.
- **R7** `wishlist` rows are keyed by `(profile_id, kind, tmdb_id)` and cascade with the
  profile. The wishlist routes work without TMDB except `PUT`.
- **R8** Posters are served by `GET /discover/poster/:file` (`[A-Za-z0-9]+.jpg|png`), only
  for a path the server handed out in a Discover answer (else `404 artwork_not_found`): the
  artwork cache downloads `w342` once through the TMDB client, the browser never contacts
  TMDB, the answer is `Cache-Control: private` (ADR-0020).
- **R9** Errors: `400 invalid_request`, `404 profile_not_found` / `title_not_found` (an id
  TMDB does not know), `409 tmdb_not_configured`,
  `502 tmdb_unavailable` when TMDB fails: an error status, a network failure or the 15 s
  timeout, a body that is not JSON or fails validation (#179). The web shows a muted line
  instead of a row.
- **R10** Out of scope: requests to Seerr / Radarr / Sonarr (#128), downloads, playback of
  titles not on disk. Done when the client, the repository, the routes, the web helpers and
  the Discover page have tests.

## 2. Main scenario

1. The viewer opens **Discover**; the system shows My list and the four TMDB rows.
2. The viewer opens a title; the sheet shows its facts and whether it is in the library.
3. The viewer presses **+ My list**; the button turns **✓ In my list**, My list reloads.
4. Later the scheduled scan finds the file and enriches it; My list shows **Available**.
5. The viewer opens it and presses **Play in my library** (UC4, UC5).

## 3. Extensions

- 1a. TMDB is not configured or fails: each row is replaced by a muted line; My list stays.
- 2a. The search matches nothing: "No title matches".
- 3a. The server refuses: the sheet reloads the list and keeps the old state.
