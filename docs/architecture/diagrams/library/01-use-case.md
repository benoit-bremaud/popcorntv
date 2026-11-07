# Use case diagram — library — manage libraries

> **Feature**: Library management — [spec](../../specs/library-management.md)
> **Related ADRs**: ADR-0014

## Context

The owner's library goals once the web app manages them. UC1 and UC2 already exist
([playback use cases](../playback/01-use-case.md)); UC21 adds add, rename and delete.

## Diagram

```mermaid
flowchart LR
  Owner((Owner))
  TMDB(("TMDB (external)"))
  subgraph SYSTEM ["PopCornTV"]
    subgraph Library ["Library domain"]
      UC21(("Manage libraries"))
      UC1(("Scan a media folder"))
      UC2(("Refresh metadata"))
    end
  end
  Owner --> UC21
  Owner --> UC1
  Owner --> UC2
  UC1 -.->|"«include» fetch metadata"| UC2
  UC2 -.->|"fetches from"| TMDB
```

## Notes

- UC21 covers add, rename and delete; the Scan button pressed after an add starts UC1 as a
  separate goal, not an «include».
- The empty-catalog welcome panel is an entry point to UC21, not a use case.
