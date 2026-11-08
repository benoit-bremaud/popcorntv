# UC21 — Manage libraries from the web app

> **Feature**: Library management — [use cases](../diagrams/library/01-use-case.md),
> [sequence](../diagrams/library/02-sequence-add-a-library.md),
> [component delta](../diagrams/library/03-component.md)
> **Issue**: #123 (folds in #122) · **Related ADRs**: ADR-0002, ADR-0010, ADR-0014
> Format: Cockburn casual use case. UC1 (scan) and UC2 (refresh metadata) keep their own
> specs ([library-scan](library-scan.md), [tmdb-metadata](tmdb-metadata.md)); this spec
> adds the screens that start them and the add, rename and delete goals.

## 1. Requirements

- **R1** The owner lists, adds, renames and deletes libraries, scans one and refreshes its
  metadata from the web app, without the API by hand. Viewers see none of it; the server
  enforces it on every route (`config.access: 'owner'`, ADR-0010).
- **R2** Folder choice (ADR-0014 §1): `GET /libraries/folders` lists the direct
  sub-folders of `MEDIA_ROOT`, one level, directories only — symbolic links and names
  starting with `.` are left out — sorted by name, each with the id of the library whose
  root overlaps it (R3), or null; the form offers only the free ones. The form also takes an absolute path typed by hand
  ("Other folder"), validated by the existing `MEDIA_ROOT` guard. (#163) On create, the root
  must also be an existing directory whose real path (links followed) stays under
  `MEDIA_ROOT` — the same check as every scan — else `409 root_unreadable`, nothing stored;
  a control character (C0, DEL, C1: NUL, newline, tab…) in the root or in the name, on
  create as on rename, is `400 invalid_request`. A trailing slash is normalised away.
- **R3** A new library's root may not equal, contain or sit inside another library's root:
  `409 root_in_use`. Two libraries over the same files would list every title twice.
- **R4** The kind (`films` | `series`) and the root are fixed once created; only the name
  changes: `PATCH /libraries/:id` `{ name }` → 200 | 400 | 404.
- **R5** `DELETE /libraries/:id` → 204 | 404 | 409 `scan_running` when a scan or an
  enrichment of it runs (same lock as UC1/UC2). The database cascade removes its media,
  their streams and every profile's progress on them. Media files on disk and the cached
  artwork (shared by digest) are never touched. The web asks the owner to type the
  library's name before it sends the request.
- **R6** Scan progress (ADR-0014 §2): the request stays synchronous. While it runs the Scan and
  Refresh buttons of every library are disabled, and the running one reads "Scanning…" or
  "Refreshing…"; the Add button is disabled while an add is sent. At the end the
  report shows added / updated / removed / skipped counts and the metadata summary. A
  `409` shows "A scan or a refresh of this library is already running."
- **R7** First run (ADR-0014 §4): an owner whose catalog is empty sees a welcome panel with
  "Add a library", which opens the library section; a viewer sees "Nothing to watch yet".
- **R8** (#122) Every route accepts `Content-Type: application/json` with an empty body as
  "no body": `POST /libraries/:id/scan` then answers 200, never 400
  `FST_ERR_CTP_EMPTY_JSON_BODY`. A non-empty body that is not JSON stays 400.
- **R9** Done when the owner adds, scans, refreshes, renames and deletes a library from
  the web, with tests on the routes (the repository through them), the API client and the
  screens.

## 2. UC21 — Manage libraries

Primary actor: Owner. Trigger: the owner opens "Administration" from the account menu,
or presses "Add a library" on the empty catalog.

1. The web loads `GET /libraries` and `GET /libraries/folders`.
2. The owner picks a folder from the list (or types a path), a name (pre-filled from the
   folder name) and a kind, then confirms.
3. The server checks the path (R2) and the overlap (R3), stores the library, answers 201.
4. The web tells the owner to scan it; the owner presses its Scan button (UC1, R6). The catalog reloads after the
   scan.
5. Later, the owner renames a library (R4), refreshes its metadata (UC2) or deletes it
   (R5).

### Extensions

- 3a. The path is not absolute or not under `MEDIA_ROOT`, or it or the name holds a control
  character (the name on rename too) → 400 `invalid_request`; the web shows the reason
  above the list.
- 3c. (#163) The root is missing, not a directory or its real path leaves `MEDIA_ROOT` →
  409 `root_unreadable`; nothing is stored; the web shows "The server cannot read this
  folder."
- 3b. The root overlaps another library → 409 `root_in_use`; the web explains that the
  folder overlaps another library. Roots are compared on their real paths, so a link to
  another library's folder overlaps it too.
- 4a. The root is unreadable → 409 `root_unreadable` (UC1).
- 5a. A scan or refresh of that library is running → 409 `scan_running` /
  `enrich_running`; nothing changes.
- 5b. The library was deleted elsewhere → 404 `library_not_found`; the list reloads.
- *a. `MEDIA_ROOT` cannot be read → `GET /libraries/folders` answers 200 with an empty
  list; the typed path stays available.

## 3. Out of scope

Scheduled and file-watch scans, a scan progress percentage (background job + polling),
several folders per library, changing a library's kind or root, deleting media files.
Each is its own issue when needed.
