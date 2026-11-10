# ADR-0031 — A personal title link keyed by TMDB title, set by the owner

- Status: accepted (owner chose A and A in the #278 chat, 2026-11-10)
- Date: 2026-11-10
- Deciders: owner
- Related: spec [title-link](../specs/title-link.md), ADR-0028, ADR-0029, issue #278

## Context

The owner wants one web link per title of their own choosing, opened in a new tab. Two
choices: what the link is attached to (D1) and who may set it (D2). PopCornTV never fetches
the link (own media only).

## D1 — What the link is attached to

A — a `title_links` table keyed by `(kind, tmdb_id)`; B — a `media.external_url` column;
C — A plus a fallback keyed by `media.id` for unmatched files.

| Criterion  | Weight | A                                   | B                              | C                         |
| ---------- | -----: | ----------------------------------- | ------------------------------ | ------------------------- |
| Coverage   |     30 | 4 — library and Discover, not unmatched | 2 — library only           | 5 — every title           |
| Durability |     25 | 5 — survives rescans and copies     | 2 — lost when a row is pruned  | 4 — fallback rows pruned  |
| Simplicity |     25 | 4 — one table, three routes         | 5 — one column                 | 2 — two key paths         |
| Security   |     20 | 5 — one validated write path        | 5 — same validation            | 4 — two write paths       |
| **Total**  |    100 | **445**                             | **335**                        | **380**                   |

A = 120 + 125 + 100 + 100; B = 60 + 50 + 125 + 100; C = 150 + 100 + 50 + 80.
Sensitivity: C overtakes A only when coverage weighs above about 52 (taken from simplicity).

## D2 — Who may set it

A — owner only, shown to every signed-in viewer; B — one private link per profile;
C — one private link per user account.

| Criterion        | Weight | A                                 | B                             | C                      |
| ---------------- | -----: | --------------------------------- | ----------------------------- | ---------------------- |
| Security (abuse) |     35 | 5 — only the admin publishes a URL | 4 — seen by its profile only | 4 — seen by its user   |
| Simplicity       |     30 | 5 — existing `access: 'owner'`    | 3 — profile key and cascade   | 3 — user key and cascade |
| Personal fit     |     20 | 3 — one link per title            | 5 — each viewer their own     | 4 — per account        |
| Role coherence   |     15 | 5 — matches library management    | 3 — any viewer writes         | 4 — per account, not role-gated |
| **Total**        |    100 | **460**                           | **375**                       | **370**                |

A = 175 + 150 + 60 + 75; B = 140 + 90 + 100 + 45; C = 140 + 90 + 80 + 60.
Sensitivity: B overtakes A only when personal fit weighs above about 41 (taken from simplicity).

## Decision

D1 A and D2 A. Table `title_links (kind, tmdb_id, url, updated_at)`, primary key
`(kind, tmdb_id)`; `GET` for any signed-in caller, `PUT | DELETE` owner-only. The URL is
validated server-side (http/https, host required, no credentials, 2048 characters at most)
and rendered as `target="_blank" rel="noopener noreferrer"`.

## Consequences

- An unmatched library file cannot carry a link until it is matched on TMDB.
- A per-profile link can be added later as a second table without changing this one.
- The URL is never logged (it may hold a private token).
