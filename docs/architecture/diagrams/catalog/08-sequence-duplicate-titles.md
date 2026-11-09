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
  Page->>Cat: collapseCopies(media, progress, libraries)
  Cat-->>Page: { media: first copy per title, copies, current, progress }
  Page-->>Viewer: one card per title, progress and mark of its current copy
  Viewer->>Page: open the card
  Page->>Dialog: item, copies, initialCopyId = current copy, libraries
  Dialog-->>Viewer: "In: Films · Animation", Copy select
  opt the viewer picks another copy
    Viewer->>Dialog: Copy = Animation
    Dialog-->>Viewer: Play / Resume of that file, audio back to its first track
  end
```

## Notes

- R3: the card is always the first copy in library order, so it keeps its focus across a
  progress reload; the current copy (saved most recently, else the first) drives its
  progress, watched mark and Continue watching entry.
