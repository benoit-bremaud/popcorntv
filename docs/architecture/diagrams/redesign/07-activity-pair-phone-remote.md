# Activity diagram — redesign — pair the phone remote

> **Feature**: UC35, UC36 — J1, decision D6 (feature #418)
> **Related ADRs**: ADR-0039

## Diagram

```mermaid
---
title: act — Pair the phone remote (ACT-pair-phone-remote)
---
flowchart TD
  Start(["start"]) --> C1
  subgraph TV ["TV app"]
    C1["Show a pairing code and QR code"]
    C6["Open the title path"]
    C7["Play and follow commands"]
  end
  subgraph Viewer ["Viewer (phone)"]
    C2["Open the remote screen"]
    C3["Scan the QR code or type the code"]
    C5["Browse and pick a title"]
    C8["Send play, pause, seek, tracks, arrows"]
    D2{"done?"}
  end
  subgraph Server ["PopCornTV server"]
    C4["Check the code, same account, not expired"]
    D1{"valid?"}
    C9["Refuse and offer a new code"]
  end
  C1 --> C2 --> C3 --> C4 --> D1
  D1 -->|"[yes]"| C5 --> C6 --> C7 --> C8 --> D2
  D1 -->|"[else]"| C9 --> C1
  D2 -->|"[no]"| C8
  D2 -->|"[yes]"| End(["end"])
```

## Notes

- Pairing and commands go through the PopCornTV server only (NFR-14); no Google Cast (#202).
- The phone sends the TV an ADR-0039 path, so the TV opens exactly the title or view picked.
- Code lifetime, retry limits and unpairing are specified in #418.
