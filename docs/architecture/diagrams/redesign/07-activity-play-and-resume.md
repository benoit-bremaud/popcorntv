# Activity diagram — redesign — play and resume

> **Feature**: UC5, UC6, UC7, UC10 — J5, J6, goals G2, G4
> **Related ADRs**: ADR-0005, ADR-0006, ADR-0007, ADR-0019, ADR-0041

## Diagram

```mermaid
---
title: act — Play and resume (ACT-play-and-resume)
---
flowchart TD
  Start(["start"]) --> B4
  subgraph App ["PopCornTV"]
    B4["Apply the profile's audio and subtitle defaults"]
    B1["Choose direct play or HLS"]
    D1{"saved position?"}
    B2["Start from the saved position"]
    B3["Start from the beginning"]
    M1{" "}
    B6["Save the position"]
    D3{"end reached?"}
    D4{"next episode and chaining allowed?"}
    B7["Offer the next episode"]
    B8["Show the end screen"]
  end
  subgraph Viewer ["Viewer"]
    M2{" "}
    B5["Watch, pause, seek, change subtitles"]
    D2{"stops?"}
  end
  B4 --> B1 --> D1
  D1 -->|"[yes]"| B2 --> M1
  D1 -->|"[else]"| B3 --> M1
  M1 --> M2 --> B5 --> D2
  D2 -->|"[else]"| M2
  D2 -->|"[yes]"| B6 --> D3
  D3 -->|"[else]"| End1(["end"])
  D3 -->|"[yes]"| D4
  D4 -->|"[yes]"| B7 --> End2(["end"])
  D4 -->|"[else]"| B8 --> End3(["end"])
```

## Notes

- The audio choice comes before direct play or HLS: a non-default track forces HLS (ADR-0019).
- The position is also saved every 10 s and on pause (ADR-0007); *Save the position* is the
  final save on stop. `M1`, `M2` are merge nodes.
- Space pauses and Back closes the player (#415, G2); every action works with arrows, OK and
  Back (G4).
- Switching the audio track while playing needs a new HLS session (ADR-0019); it is filed
  separately and drawn as an entry point only. The player controls (D5) are decided in #399.
- A child account never chains episodes (J4); the end screen gives a clear stop.
- A reload on a `/play/…` path reopens the title with *Resume*, never playback (ADR-0041).
