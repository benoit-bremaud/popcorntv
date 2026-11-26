# Activity diagram — on-demand retrieval — deletion sweep

> **Feature**: UC40, UC42 (ACT-deletion)
> **Requirements**: REQ-46, REQ-51, REQ-52
> **Related ADRs**: ADR-0045

Runs every 15 min on the serial timer and once at start-up, for each retrieved title.

## Diagram

```mermaid
---
title: act — Deletion sweep (ACT-deletion)
---
flowchart TD
  Start(["for each retrieved title"]) --> D0{"lease active?"}
  D0 -- "yes" --> Skip(["skip"])
  D0 -- "no" --> D1{"ever played?"}
  D1 -- "no" --> D2{"now − t_sheet ≥ 6 h and not favourite?"}
  D2 -- "yes" --> A1["purge the prefetch"] --> Next(["next title"])
  D2 -- "no" --> Next
  D1 -- "yes" --> D3{"now − t_play ≥ 48 h?"}
  D3 -- "no" --> Next
  D3 -- "yes" --> D4{"favourite of at least one profile?"}
  D4 -- "no" --> A2["delete the file and its generation"] --> Next
  D4 -- "yes" --> D5{"more than the first third on disk?"}
  D5 -- "yes" --> A3["trim to the first third (bytes 0 … size / 3)"] --> Next
  D5 -- "no" --> Next
```

## Rules

- "First third" is the byte range from 0 to one third of the file size, rounded up to whole
  verified pieces.
- An abandoned playback counts as a playback: the 48 h start at the last lease release.
- Deletion removes the generation's files and its rows except the anonymous statistics.
- A title never played but marked favourite keeps its first third (REQ-52).
