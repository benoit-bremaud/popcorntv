# ADR-0018 — Carry watch progress over at scan time

- Status: accepted (owner chose A in the #131 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [progress-carry-over](../specs/progress-carry-over.md), ADR-0007, issue #134

## Context

`watch_progress.media_id` cascades on delete. An upgrade or a remux replaces a file on
another path: the scan deletes the old row and the progress is lost. This blocks the
Jellyfin cut-over.

## Options

A — at scan time, before the delete, move the progress to the present file of the same
identity (provider ids, else parsed title + year, episode numbers); B — keep orphaned
progress and re-attach it by `tmdb_id` after the enrichment; C — status quo.

| Criterion        | Weight | A                                         | B                                            | C                      |
| ---------------- | -----: | ----------------------------------------- | -------------------------------------------- | ---------------------- |
| Covers the case  |     40 | 4 — survives renames, not a title change  | 5 — survives any name once TMDB matched      | 0 — progress lost      |
| Simplicity       |     35 | 4 — one transaction, a pure key function  | 2 — orphan rows, a second pass, a new column | 5 — nothing to do      |
| Wrong-match risk |     25 | 4 — ambiguous matches carry nothing       | 4 — TMDB ids can be wrong too                | 5 — nothing to get wrong |
| **Total**        |    100 | **400**                                   | **370**                                      | **300**                |

Sensitivity: with coverage weighted 50, A (400) and B (395) are close; A stays first.

## Decision

A, in `LibraryRepository.deleteMissing` with the pure `identityKeys` / `carryOverTargets`.

## Consequences

- A file replaced under a new title and year without a TMDB tag loses its progress (B
  would cover it); revisit if it happens.
