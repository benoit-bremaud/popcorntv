# Duplicate titles — one card per title found in several libraries

When the same film sits in two libraries (Films and Animation), the catalog shows one card
for it; the detail dialog names the libraries and lets the viewer pick which file to play.

> **Feature**: Catalog — UC3 / UC4 rule ([catalog-grid](catalog-grid.md))
> **Issue**: #176 · **Related ADRs**: ADR-0004, ADR-0018, ADR-0026
> **Diagrams**: [component](../diagrams/catalog/03-component.md),
> [sequence](../diagrams/catalog/08-sequence-duplicate-titles.md)
> Format: business rules.

## 1. Requirements

- **R1** Same title (`titleKey`, pure, `apps/web/src/catalog/catalog.ts`): a film or an
  unmatched file by its TMDB id (metadata, else the `{tmdb-…}` tag of its name) in its
  library's TMDB namespace (a films library looks up movies, a series library TV shows,
  so movie 1399 and TV show 1399 stay apart) and part; without one, by its kind, NFC
  lower-cased title, year and part. Versions of one title in the same library (`- 1080p`,
  `- 2160p`) collapse too. Two parts of one film
  and two titles of different years stay apart.
- **R2** Series and episodes are never collapsed: merging seasons from two libraries is out
  of scope (a later issue if it ever happens).
- **R3** `collapseCopies` (pure) shows one card per title, in every row, grid, search result
  and Continue watching: always the first copy in library order (`GET /libraries` order),
  so the card keeps the keyboard focus across a progress reload. The **current copy** —
  the one the profile saved most recently, else the first — gives the card its progress,
  its watched mark and its Continue watching entry; the other copies' rows are ignored
  for the card. A watched mark counts as a save (it updates the row).
- **R4** The detail dialog of a collapsed title shows "In: <library> · <library>" and a
  **Copy** select naming each copy by its library, followed by its path when another copy
  shares that library, by its path alone when the library is unknown.
  A title held by one file shows neither.
- **R5** Play, Resume, Start over, the audio list and the watched mark act on the chosen
  copy; choosing another copy resets the audio to its first track. The dialog opens on the
  current copy, also when Discover's "Play in my library" (spec discover-wishlist R4) names
  a hidden copy: the server picks that copy without an order, so it carries no intent.
- **R6** No server change: the libraries and their media keep their routes (library
  management, scan, carry-over unchanged); the web catalog load returns the libraries with
  the media.
- **R7** Done when `titleKey` and `collapseCopies` have unit tests (happy, sad, edge) and
  the dialog and page tests show one card and a working copy picker.

## 2. Edge cases

- A copy not yet enriched (no TMDB id) and an enriched one show as two cards until the
  enrichment chained to the scan matches the first: accepted, transient.
- Two different films with the same title and year and no TMDB id collapse; the Copy select
  still reaches both.
- Progress stays per file (ADR-0007): resuming the Animation copy does not move the Films
  copy's position.
- Unmarking the current copy deletes its row: an older finished copy then becomes current
  and the card keeps its ✓ (consistent with R3).
