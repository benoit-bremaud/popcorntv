# Component diagram — library — delta for library management

> **Feature**: Library management — [spec](../../specs/library-management.md)
> **Related ADRs**: ADR-0014 · Full structure: [playback component](../playback/03-component.md)

## Context

Only what #123 adds or changes; new elements are marked «new».

## Diagram

```mermaid
flowchart LR
  subgraph Web ["apps/web"]
    Admin[AdminPanel]
    LibSec["LibrarySection «new»"]
    Welcome["Empty-catalog welcome «new»"]
    Api["libraryApi «new» (api.ts)"]
    Admin --> LibSec
    Welcome --> Admin
    LibSec --> Api
  end
  subgraph Server ["apps/server"]
    Routes["Library routes (+ folders, PATCH, DELETE)"]
    Folders["folder-lister «new» (readdir, one level)"]
    Guard[path-guard]
    Repo["Library repository (+ rename, delete)"]
    Lock[Library lock]
    Parser["JSON parser: empty body = none (#122)"]
    Routes --> Folders
    Routes --> Guard
    Routes --> Repo
    Routes --> Lock
  end
  Api -->|"HTTP /api/libraries…"| Routes
  Folders -->|"fs.readdir"| FS[("MEDIA_ROOT")]
```

## Notes

- `folder-lister` is the only new filesystem read; it never follows symbolic links.
- The dependency rule holds: the web depends on the shared contracts only.
