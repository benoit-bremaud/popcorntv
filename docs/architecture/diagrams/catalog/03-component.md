# Component diagram — catalog (apps/web)

> **Feature**: UC3 / UC4 / UC22 / UC24 / UC26 / UC27 / UC28 / UC29 ([spec](../../specs/catalog-grid.md), [continue-watching](../../specs/continue-watching.md), [where-to-watch](../../specs/where-to-watch.md), [wishlist-notifications](../../specs/wishlist-notifications.md))
> **Related ADRs**: ADR-0001, ADR-0004, ADR-0020, ADR-0024, ADR-0026, ADR-0029, ADR-0030

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
    watch["discover/WhereToWatch «new #184»<br/>French offers, links to TMDB watch page"]
    sheet --> watch
    detail --> watch
    watch --> api
    bell["discover/NotificationBell «new #277»<br/>unread count, panel, polls 5 min"]
    app --> bell
    bell --> api
    tokens[(styles/tokens.css)]
  end
  shared[packages/shared<br/>Media, isDocumentary, WatchProgress]
  cat --> shared
  cat --> resume[playback/resume.ts<br/>resumeAt, pure]
  api --> shared
  api -->|/api/libraries, /api/libraries/:id/media, /api/profiles/:profileId/progress| server[apps/server]
  card -->|/api/artwork/:file| server
  api -->|/api/discover, /api/discover/search, /api/discover/:kind/:tmdbId,<br/>/api/discover/poster/:file, /api/profiles/:profileId/wishlist,<br/>/api/discover/:kind/:tmdbId/providers, /api/discover/logo/:file «#184»| droutes
  api -->|/api/profiles/:profileId/notifications,<br/>/api/profiles/:profileId/providers «#277»| nroutes
  subgraph srv[apps/server «#127 delta»]
    droutes[discover/routes] --> wrepo[discover/wishlist-repository]
    droutes --> tmdbc[metadata/tmdb-client<br/>only HTTP egress]
    droutes --> cache[metadata/artwork-cache]
    droutes --> stale["discover/stale-cache «new #184»<br/>fresh, then stale-while-refresh, LRU"]
    cache --> tmdbc
    wrepo --> db[(SQLite wishlist, media,<br/>profile_providers, notifications)]
    check["discover/availability-check «new #277»<br/>timer, pure availabilityEvents"] --> wrepo
    check --> stale
    check --> nrepo["discover/notification-repository «new #277»"]
    nroutes["discover/notification-routes «new #277»"] --> nrepo
    nroutes --> mprepo["discover/my-provider-repository «new #277»"]
    check --> mprepo
    mprepo --> db
    nrepo --> db
  end
  tmdbc -->|HTTPS| tmdb([TMDB])
```

## Notes

- Flat layout (architecture rule: no layers without a force): two pure modules hold all
  the logic and are unit-tested; components only render.
- #127: Discover never talks to TMDB from the browser (ADR-0020); availability of a wishlist
  entry is a join on `media.tmdb_id` in `wishlist-repository`.
- #184: `WhereToWatch` shows the French legal offers on both sheets; an offer is a plain
  link to the TMDB watch page (ADR-0029). Lists and providers share `stale-cache`.
- #277: `availability-check` runs on a timer (ADR-0016 pattern), reads offers through the
  shared `stale-cache` and writes in-app notifications (ADR-0030); `NotificationBell` polls them.
