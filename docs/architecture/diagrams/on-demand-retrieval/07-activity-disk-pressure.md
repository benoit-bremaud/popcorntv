# Activity diagram — on-demand retrieval — disk pressure

> **Feature**: UC40, UC42 (ACT-disk-pressure)
> **Requirements**: REQ-53
> **Related ADRs**: ADR-0044

Runs before every reservation (prefetch, rest of the file, favourite third).

## Diagram

```mermaid
---
title: act — Disk pressure (ACT-disk-pressure)
---
flowchart TD
  Start(["reservation of N bytes"]) --> A1["ceiling = min(owner value, used + free − 15 % of volume)"]
  A1 --> D1{"used + N ≤ ceiling?"}
  D1 -- "yes" --> A9["reserve N bytes"] --> Done(["done"])
  D1 -- "no" --> D2{"unplayed prefetch left?"}
  D2 -- "yes" --> A2["purge the oldest unplayed prefetch (t_sheet)"] --> A1
  D2 -- "no" --> D3{"title awaiting its 48 h left?"}
  D3 -- "yes" --> A3["delete the oldest (t_play) non-favourite idle title"] --> A1
  D3 -- "no" --> D4{"request is a playback?"}
  D4 -- "yes" --> A4["play from what fits; retrieval continues as reads free space"] --> Done
  D4 -- "no" --> A5["refuse: 'no space for now' on the sheet"] --> Refused(["refused"])
```

## Rules

- Never evicted: titles being played (a lease), favourite thirds, files under `MEDIA_ROOT`.
- A prefetch is never evicted to make room for another prefetch of lower or equal priority if it
  was opened in the last 5 min (prevents two open sheets from evicting each other).
- Every eviction is logged with its reason (`retrieval.evicted`, ADR-0021) and counted in the
  statistics (space saved).
