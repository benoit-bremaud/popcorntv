# Component diagram — catalog (apps/web)

> **Feature**: UC3 / UC4 / UC22 / UC24 / UC26 / UC27 ([spec](../../specs/catalog-grid.md), [continue-watching](../../specs/continue-watching.md))
> **Related ADRs**: ADR-0001, ADR-0004, ADR-0020, ADR-0024, ADR-0026

## Diagram

```mermaid
flowchart TB
  subgraph web[apps/web]
    app[App] --> page[catalog/CatalogPage]
    page --> controls[catalog/Controls]
    page --> search["catalog/SearchBox «new #135»"]
    page --> live["a11y/LiveStatus «new #165»<br/>polite status, useSettledMessage 500 ms"]
    discover --> live
    page --> row[catalog/PosterRow]
    page --> grid[catalog/PosterGrid]
    page --> detail[catalog/DetailDialog]
    detail --> layer["history-layer.ts «new #169»<br/>useHistoryLayer, Back closes a dialog"]
    sheet --> layer
    row --> card[catalog/PosterCard]
    grid --> card
    page --> state[catalog/view-state.ts<br/>reducer, pure]
    page --> cat[catalog/catalog.ts<br/>rows, searchItems, collapseCopies «#176», pure]
    page --> api[api.ts<br/>fetch, only HTTP egress]
    app --> discover["discover/DiscoverPage «new #127»"]
    discover --> sheet["discover/TitleSheet «new #127»"]
    discover --> api
    tokens[(styles/tokens.css)]
  end
  shared[packages/shared<br/>Media, isDocumentary, WatchProgress]
  cat --> shared
  cat --> resume[playback/resume.ts<br/>resumeAt, pure]
  api --> shared
  api -->|/api/libraries, /api/libraries/:id/media, /api/profiles/:profileId/progress| server[apps/server]
  card -->|/api/artwork/:file| server
  api -->|/api/discover, /api/discover/search, /api/discover/:kind/:tmdbId,<br/>/api/discover/poster/:file, /api/profiles/:profileId/wishlist| droutes
  subgraph srv[apps/server «#127 delta»]
    droutes[discover/routes] --> wrepo[discover/wishlist-repository]
    droutes --> tmdbc[metadata/tmdb-client<br/>only HTTP egress]
    droutes --> cache[metadata/artwork-cache]
    cache --> tmdbc
    wrepo --> db[(SQLite wishlist, media)]
  end
  tmdbc -->|HTTPS| tmdb([TMDB])
```

## Notes

- Flat layout (architecture rule: no layers without a force): two pure modules hold all
  the logic and are unit-tested; components only render.
- #127: Discover never talks to TMDB from the browser (ADR-0020); availability of a wishlist
  entry is a join on `media.tmdb_id` in `wishlist-repository`.
