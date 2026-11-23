# Activity diagram — redesign — choose a title

> **Feature**: UC3, UC4, UC22, UC24, UC37 — J2, J3, J6, goal G3
> **Related ADRs**: ADR-0038, ADR-0039

## Diagram

```mermaid
---
title: act — Choose a title (ACT-choose-a-title)
---
flowchart TD
  Start(["start"]) --> A1
  subgraph Viewer ["Viewer"]
    A1["Open the home screen"]
    D1{"title to finish?"}
    A2["Pick it in Continue watching"]
    D2{"title in mind?"}
    A3["Search by title or person"]
    A4["Browse rows by type and genre"]
    A5["Read synopsis, rating and cast"]
    D3{"wants the trailer?"}
    D4{"decided?"}
    A7["Press Play or Resume"]
  end
  subgraph App ["PopCornTV"]
    A6["Show the trailer (call: UC37, ADR-0038)"]
    A8["Start playback (call: ACT-play-and-resume)"]
  end
  A1 --> D1
  D1 -->|"[yes]"| A2 --> A8
  D1 -->|"[else]"| D2
  D2 -->|"[yes]"| A3 --> A5
  D2 -->|"[else]"| A4 --> A5
  A5 --> D3
  D3 -->|"[yes]"| A6 --> D4
  D3 -->|"[else]"| D4
  D4 -->|"[yes]"| A7 --> A8 --> End(["end"])
  D4 -->|"[else]"| D2
```

## Notes

- Continue watching plays in one activation (G3); the hero offers Play or Resume in at most two.
- The trailer runs only on request; nothing starts with sound unasked (G7).
- A suggestions row (J2, #160) would sit beside the rows in *Browse rows*; drawn as a reserved
  slot only.
