# ADR-0014 — Library management in the web app

- Status: accepted (owner chose C, A, A, A in the #123 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [library-management](../specs/library-management.md), ADR-0002,
  ADR-0010, issues #123, #122

## Context

Libraries could only be created and scanned with the API (#60 deployment). Plex and
Jellyfin offer a first-run wizard, a server-side folder picker, a fixed library type,
manual and scheduled scans with a progress bar, a metadata refresh, and rename / delete.
Netflix configures nothing: the catalog is simply full. Four choices were made with an
MCDA matrix each (scores 0–5, weights /100, totals /500; scores are estimates, facts
checked in the code: cascade deletes exist, Caddy sets no proxy timeout, a per-library
lock already refuses overlapping scans).

## 1. Folder choice

A — server-side tree browser under `MEDIA_ROOT`; B — typed path only; C — the direct
sub-folders of `MEDIA_ROOT` plus a typed path.

| Criterion     | Weight | A   | B   | C   |
| ------------- | -----: | --- | --- | --- |
| Security      |     35 | 4   | 5   | 4   |
| UX            |     30 | 5   | 2   | 4   |
| Simplicity    |     20 | 3   | 5   | 4   |
| Effort        |     15 | 3   | 5   | 4   |
| **Total**     |        | 395 | 400 | 400 |

Sensitivity: with UX at 40 and security at 25, C 400, A 390, B 350. **C chosen**: it
covers the real layout (`films/`, `series/`) in one click and reads one level only; the
typed path avoided by B is the error made during #60.

## 2. Scan progress

A — synchronous request with a busy state; B — background job, 202, polling.

| Criterion     | Weight | A   | B   |
| ------------- | -----: | --- | --- |
| UX            |     35 | 3   | 5   |
| Simplicity    |     30 | 5   | 3   |
| Robustness    |     20 | 4   | 5   |
| Effort        |     15 | 5   | 2   |
| **Total**     |        | 410 | 395 |

Sensitivity: B leads once UX outweighs simplicity by about 15 points. **A chosen**: the
scan finishes server-side even if the tab closes, the contract and the deploy command
stay; B is the issue to open when scans last minutes.

## 3. Scope

A — list, add, scan, refresh, rename, delete; B — A without delete; C — A plus scheduled
scans.

| Criterion | Weight | A   | B   | C   |
| --------- | -----: | --- | --- | --- |
| Value     |     40 | 5   | 4   | 5   |
| Risk      |     30 | 4   | 5   | 2   |
| PR size   |     30 | 4   | 4   | 1   |
| **Total** |        | 440 | 430 | 290 |

**A chosen**: the cascade makes delete one statement under the lock; without it a
mistaken library stays forever.

## 4. First run

A — welcome panel on an empty catalog for the owner; B — multi-step wizard; C — admin
panel only.

| Criterion  | Weight | A   | B   | C   |
| ---------- | -----: | --- | --- | --- |
| UX         |     50 | 4   | 5   | 2   |
| Simplicity |     50 | 5   | 2   | 5   |
| **Total**  |        | 450 | 350 | 350 |

**A chosen**: the account already exists (setup link, ADR-0010); only libraries remain.

## Consequences

- New owner routes `GET /libraries/folders`, `PATCH /libraries/:id`, `DELETE
  /libraries/:id`; new error code `root_in_use`.
- The JSON body parser treats an empty body as no body (#122).
- Follow-up issues: scheduled scan, background scan with progress.
