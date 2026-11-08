# UC22 — Continue watching

The catalog home opens with a row of the active profile's titles to pick up again.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md),
> [sequence](../diagrams/catalog/06-sequence-continue-watching.md)
> **Issue**: #131 · **Related ADRs**: ADR-0004, ADR-0007, ADR-0008, ADR-0015
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** On the home view (no type chosen), a **Continue watching** row comes first, above
  the other rows. It is not shown in a type view, nor when it is empty.
- **R2** It is built from the active profile's progress (`GET
  /profiles/:profileId/progress`, newest first) joined on the loaded catalog, in the
  browser (ADR-0015). No new server route.
- **R3** A film or an "other" title appears when it can be resumed (`resumeAt > 0`,
  spec resume-playback §2.4).
- **R4** A series appears once, decided by its most recently saved episode:
  - that episode can be resumed → the series is shown with that episode's progress;
  - that episode is finished and a next episode exists (`nextEpisode`) that is not
    finished → the series is shown with the next episode's progress (empty when not started);
  - that episode is barely started (under 10 s) → it is skipped and the next older
    episode of the series decides;
  - otherwise the series is left out.
- **R5** Items keep the progress order (most recently saved first), at most 20.
- **R6** Each card shows a progress bar (position / duration; hidden when the duration is
  unknown). Activating a card opens the detail dialog of the film or the series, whose
  Resume / episode ▶ buttons apply the existing resume rules.
- **R7** The row is reloaded when the detail dialog closes, once the player's last
  progress save has landed (#140), so a title just watched moves to the front with its
  new position. A progress load failure shows the catalog without the row.
- **R8** Done when the row rules have unit tests (resume, finished film, series next
  episode, last episode, one card per series, limit) and the page test shows the row.

## 2. Main scenario

1. The viewer opens the catalog with a profile chosen.
2. The page loads the catalog and the profile's progress.
3. The page computes the row (`continueWatchingRow`) and shows it first.
4. The viewer activates a card; the detail dialog opens (UC4) and Play resumes (UC6/UC7).
5. On close, the page waits for the player's last save, reloads the progress and
   recomputes the row.

## 3. Extensions

- 2a. The progress request fails → no row, the rest of the catalog is unchanged.
- 3a. A saved media is no longer in the catalog (library removed) → its row is ignored.
- 5a. The viewer leaves the catalog before the last save lands → the catalog loaded on
  return may show the previous position until the next dialog close (known limit, one
  save round trip).
