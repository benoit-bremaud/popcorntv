# UC24 — Search titles and people

The viewer types in a search field above the catalog and gets the titles whose name, or a
cast member's name, matches.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md)
> **Issue**: #135 · **Related ADRs**: ADR-0004, ADR-0015
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** A search field (`<search>`, labelled "Search titles and people") sits above the
  catalog controls. Escape clears it.
- **R2** Matching runs in the browser over the loaded catalog (like the rows, ADR-0015):
  case and accents are ignored; a top-level title matches when its title or one of its
  cast names contains the query. TMDB stores no crew, so directors are not searchable.
- **R3** Results: title matches first, then person matches, each A–Z (`localeCompare`, browser locale), in one grid titled
  *Results for "…"*. A polite live region (`LiveStatus`, always mounted, `role="status"`
  with an explicit `aria-live`) announces *N results for "…"* once typing pauses for
  500 ms, so rapid typing yields one announcement; it empties at once when the query is
  cleared (#165). The hero, the controls and the rows are hidden while a query is set.
- **R4** No match → a status message *No title or person matches "…"*, announced as
  *No match for "…"*.
