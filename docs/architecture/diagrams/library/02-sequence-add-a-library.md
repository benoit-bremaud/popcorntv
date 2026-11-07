# Sequence diagram — library — add a library and scan it

> **Feature**: Library management — [spec](../../specs/library-management.md) UC21
> **Related ADRs**: ADR-0010, ADR-0014

## Context

The owner adds a library from the folder list, then scans it. Access hook and CSRF
checks (ADR-0010) run before every route and are not repeated here.

## Diagram

```mermaid
sequenceDiagram
  actor Owner
  participant Web as Library section (web)
  participant Routes as Library routes
  participant FS as Filesystem (MEDIA_ROOT)
  participant Repo as Library repository
  participant Lock as Library lock
  participant Scanner as Scanner (+ enrich)

  Owner->>Web: open Administration › Libraries
  Web->>Routes: GET /libraries/folders
  Routes->>FS: readdir(MEDIA_ROOT, one level)
  FS-->>Routes: directory entries
  Routes->>Repo: listLibraries()
  Repo-->>Routes: libraries
  Routes-->>Web: 200 { root, folders[] }
  Owner->>Web: pick folder, name, kind; Add
  Web->>Routes: POST /libraries { name, rootPath, kind }
  alt path invalid or outside MEDIA_ROOT
    Routes-->>Web: 400 invalid_request
  else root overlaps another library
    Routes-->>Web: 409 root_in_use
  else accepted
    Routes->>Repo: createLibrary(body)
    Routes-->>Web: 201 Library
    Owner->>Web: Scan
    Web->>Routes: POST /libraries/:id/scan (empty body)
    Routes->>Lock: run(id, scan + include enrich)
    alt library busy
      Lock-->>Routes: LibraryBusyError
      Routes-->>Web: 409 scan_running
    else
      Lock->>Scanner: scan(library)
      Scanner-->>Lock: ScanReport
      Routes-->>Web: 200 ScanReport
      Web->>Web: show report, reload catalog
    end
  end
```

## Notes

- The scan request stays synchronous (ADR-0014 §2); the web disables the library's
  buttons until it answers.
- Rename (`PATCH`) and delete (`DELETE`, under the same lock) follow the same shape.
