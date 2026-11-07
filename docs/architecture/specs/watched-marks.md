# UC23 — Mark a title watched or unwatched

A profile marks a film, an episode or a whole series watched or unwatched, and every poster
shows what it has watched.

> **Feature**: Watch — [use cases](../diagrams/playback/01-use-case.md)
> **Issue**: #133 · **Related ADRs**: ADR-0007, ADR-0008, ADR-0017
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** A title is *watched* when its progress row is *finished*: reached ≥ 90 % at the end
  of playback (`isFinished`, spec resume-playback R4) **or** marked by hand (`watched_at`
  set, ADR-0017). `GET /profiles/:profileId/progress` reports both as `finished: true`.
- **R2** `PUT /profiles/:profileId/media/:id/watched` → `204` sets `watched_at` (the saved
  position is kept). For a `series` row it applies to each of its episodes.
- **R3** `DELETE /profiles/:profileId/media/:id/watched` → `204` forgets the progress row
  (position included); a series applies to each episode. Both routes: `400` on a bad id,
  `404 profile_not_found` / `media_not_found`.
- **R4** A series is watched when it has episodes and each one is finished. A watched poster
  shows a ✓ mark and its accessible name ends with ", watched".
- **R5** The detail dialog offers **Mark as watched** / **✓ Watched** (a toggle,
  `aria-pressed`) for a playable title or a series with episodes; each watched episode is
  labelled "watched".
- **R6** Done when the repository, both routes, the web helpers, the toggle and the poster
  mark have tests.

## 2. Main scenario

1. The viewer opens a title (UC4) and presses **Mark as watched**.
2. The system stores the mark and the dialog reloads the progress: the button shows
   **✓ Watched**, the title leaves Continue watching (UC22).
3. On close the catalog reloads the progress: the poster shows ✓.

## 3. Extensions

- 1a. The title is watched: the viewer presses **✓ Watched**; the progress is forgotten.
- 2a. The server refuses or is unreachable: the dialog reloads and keeps the old state.
