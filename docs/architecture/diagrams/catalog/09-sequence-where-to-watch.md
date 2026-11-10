# Sequence diagram — catalog — where to watch

How a title sheet gets its French legal offers and a viewer leaves for a provider.

> **Feature**: UC27 ([spec](../../specs/where-to-watch.md))
> **Related ADRs**: ADR-0027, ADR-0029 · **Issues**: #184

## Diagram

```mermaid
sequenceDiagram
  actor Viewer
  participant Sheet as TitleSheet / DetailDialog (React)
  participant Routes as discover/routes.ts
  participant Tmdb as tmdb-client.ts
  participant Art as artwork-cache.ts

  Viewer->>Sheet: open a title
  Sheet->>Routes: GET /discover/:kind/:tmdbId/providers
  alt fresh in memo
    Routes-->>Sheet: { link, offers }
  else stale in memo
    Routes-->>Sheet: { link, offers } (old)
    Routes-)Tmdb: watchProviders(kind, id) (one refresh)
  else not cached
    Routes->>Tmdb: watchProviders(kind, id)
    Tmdb-->>Routes: FR entry or none
    Routes-->>Sheet: { link, offers } or 502
  end
  loop each offer logo
    Sheet->>Routes: GET /discover/logo/:file
    Routes->>Art: cache(path, w92) (issued paths only)
    Art-->>Routes: file
    Routes-->>Sheet: image
  end
  Sheet-->>Viewer: offers grouped by type, JustWatch attribution
  Viewer->>Sheet: click an offer
  Sheet-->>Viewer: TMDB watch page in a new tab (noopener noreferrer)
```

## Notes

- R8: no stream crosses PopCornTV; the last step is a plain link.
