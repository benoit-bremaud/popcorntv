# Sequence diagram — catalog — continue watching

> **Feature**: UC22 ([spec](../../specs/continue-watching.md))
> **Related ADRs**: ADR-0007, ADR-0015 · **Issues**: #140

## Diagram

```mermaid
sequenceDiagram
  actor Viewer
  participant Page as CatalogPage (React)
  participant Api as api.ts
  participant Server as Fastify server
  participant Cat as catalog.ts (pure)

  Viewer->>Page: open the catalog (profile chosen)
  par
    Page->>Api: loadCatalog()
    Api->>Server: GET /api/libraries (+ media per library)
    Server-->>Api: Media[]
    Api-->>Page: Media[]
  and
    Page->>Api: loadProgress(profileId)
    Api->>Server: GET /api/profiles/:profileId/progress
    Server-->>Api: WatchProgress[] (newest first)
    Api-->>Page: WatchProgress[] ([] on failure)
  end
  Page->>Cat: continueWatchingRow(media, progress)
  Cat-->>Page: Row | null
  Page-->>Viewer: Continue watching row first, then home rows
  Viewer->>Page: activate a card
  Page-->>Viewer: detail dialog of the film or series (UC4, resume UC6/UC7)
  Viewer->>Page: close the dialog
  Note over Page: waits for the player's last PUT progress (R7, #140)
  Page->>Api: loadProgress(profileId)
  Api-->>Page: WatchProgress[]
  Page->>Cat: continueWatchingRow(media, progress)
  Page-->>Viewer: row reordered
```

## Notes

- The join is pure and runs in the browser over data the page already holds
  (ADR-0015); the server is unchanged.
