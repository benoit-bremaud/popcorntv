# ADR-0016 — Scheduled scan on an in-process timer

- Status: accepted (owner chose A in the #131 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [scheduled-scan](../specs/scheduled-scan.md), ADR-0014, issue #132

## Context

Files added by hand (or replaced by Radarr, Sonarr, Tdarr) only appear after a manual scan.
Plex and Jellyfin offer both a periodic scan and a filesystem watch.

## Options

A — an in-process interval (`SCAN_INTERVAL_MIN`); B — a filesystem watch (`fs.watch`,
inotify); C — an external cron calling the scan route.

| Criterion   | Weight | A                                   | B                                         | C                               |
| ----------- | -----: | ----------------------------------- | ----------------------------------------- | ------------------------------- |
| Reliability |     35 | 5 — works on every mount            | 2 — inotify misses events on bind / NFS   | 4 — depends on the host's cron  |
| Simplicity  |     30 | 5 — reuses the scan and its lock    | 2 — debounce, recursion, re-arm on errors | 3 — a token to create and store |
| Freshness   |     20 | 3 — up to the interval              | 5 — immediate                             | 3 — up to the interval          |
| Security    |     15 | 5 — nothing exposed                 | 5 — nothing exposed                       | 3 — one more secret             |
| **Total**   |    100 | **460**                             | **305**                                   | **335**                         |

Sensitivity: with weights 30 / 20 / 40 / 10, A (420) still leads B (350) and C (330).

## Decision

A, default 60 minutes. A run reuses `scanLibrary` (lock + enrichment) and skips a busy
library.

## Consequences

- A file appears within the interval; the manual scan stays for "now".
- A watch can be added later for local disks if the delay matters.
