# Progress carry-over — keep resume progress when a file moves

When a scan finds that a file was replaced by another one holding the same title (a Radarr
or Sonarr upgrade, a Tdarr remux), the profiles' progress moves to the new file instead of
being deleted with the old row.

> **Feature**: Library — UC1 extension · Watch — UC6
> **Issue**: #134 · **Related ADRs**: ADR-0002, ADR-0007, ADR-0017, ADR-0018
> Format: business rules.

## 1. Requirements

- **R1** During UC1, before the rows of missing files are deleted (spec library-scan step 8, see R5), each one's `watch_progress` rows move to the present file of the same library holding
  the same title.
- **R2** Same title (`identityKeys`, pure): an episode by its series row, season and
  episode number; any other file by its parsed title, year and part, or by its TMDB id
  (metadata, else the `{tmdb-…}` tag of the new file name) and part.
- **R3** Exactly one present file must match; an ambiguous or missing match carries nothing
  (the progress goes with the old row, as before). A file deleted on purpose next to a
  kept copy of the same title (a 720p removed beside a 4K) hands its progress to that copy.
- **R4** When the new file already has a row for that profile, the most recently updated
  one wins; a watched mark (`watched_at`) on either side is kept, even when the new file was
  unmarked after the old one was marked (an accepted edge case: unmark again).
- **R5** Pruning rules are unchanged: no deletion, hence no carry-over, when the walk was
  partial (spec library-scan step 8, skipped on 3a, 3b, 4b).
- **R6** Done when the key and match rules have unit tests and a scanner test shows a
  replaced file keeping its position.
