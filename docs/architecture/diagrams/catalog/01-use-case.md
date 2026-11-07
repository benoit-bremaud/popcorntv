# Use case diagram — catalog

> **Feature**: UC3 Browse the catalog, UC4 Open a title ([spec](../../specs/catalog-grid.md)), UC22 Continue watching ([spec](../../specs/continue-watching.md)), UC24 Search ([spec](../../specs/search.md))
> **Related ADRs**: ADR-0004

## Diagram

```mermaid
flowchart LR
  viewer([Viewer])
  subgraph Catalog
    uc3((UC3 Browse the catalog))
    uc3a((Narrow by type))
    uc3b((Narrow by genre))
    uc4((UC4 Open a title))
    uc22((UC22 Continue watching))
    uc24((UC24 Search titles and people))
  end
  viewer --- uc3
  viewer --- uc4
  viewer --- uc22
  viewer --- uc24
  uc24 -. include .-> uc4
  uc22 -. include .-> uc4
  uc3a -. extend .-> uc3
  uc3b -. extend .-> uc3a
```

## Notes

- *Narrow by genre* extends *Narrow by type*: genre options exist only once a type is
  chosen (progressive disclosure, state diagram 05).
- *Watch a title* (UC5, #7) will extend UC4 from the detail dialog.
