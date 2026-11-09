# Sequence diagram — catalog — duplicate titles

How a title found in two libraries becomes one card and a copy picker.

> **Feature**: UC3 / UC4 ([spec](../../specs/duplicate-titles.md))
> **Related ADRs**: ADR-0026 · **Issues**: #176

## Diagram

```mermaid
sequenceDiagram
  actor Viewer
  participant Page as CatalogPage (React)
  participant Api as api.ts
  participant Cat as catalog.ts (pure)
  participant Dialog as DetailDialog (React)

  Viewer->>Page: open the catalog
  Page->>Api: loadCatalog()
  Api-->>Page: { libraries, media }
  Page->>Cat: collapseCopies(media, progress)
  Cat-->>Page: { media without hidden copies, copies by shown id }
  Page-->>Viewer: one card per title (watched if any copy is)
  Viewer->>Page: open the card
  Page->>Dialog: item, copies, initialCopyId, libraries
  Dialog-->>Viewer: "In: Films · Animation", Copy select
  opt the viewer picks another copy
    Viewer->>Dialog: Copy = Animation
    Dialog-->>Viewer: Play / Resume of that file
  end
```

## Notes

- R3: the shown copy is the one saved most recently, else the first in library order.
