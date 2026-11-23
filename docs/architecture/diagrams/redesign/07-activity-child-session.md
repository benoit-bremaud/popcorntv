# Activity diagram — redesign — child session

> **Feature**: UC3, UC5, UC39 — J4, J8; restriction per account (REQ-26, REQ-27, #316)
> **Related ADRs**: ADR-0008, ADR-0039

## Diagram

```mermaid
---
title: act — Child session (ACT-child-session)
---
flowchart TD
  Start(["start"]) --> E1
  subgraph Child ["Viewer (child account)"]
    E1["Pick my profile with the TV remote"]
    E3["Pick a show from the posters"]
    E5["Watch"]
    D2{"another episode?"}
  end
  subgraph App ["PopCornTV"]
    E2["Show only titles the account allows"]
    D1{"title allowed?"}
    E4["Play in French without subtitles (profile defaults)"]
    E6["Show the end screen, no chaining"]
  end
  E1 --> E2 --> E3 --> D1
  D1 -->|"[within the rating or allowed by the owner]"| E4 --> E5 --> E6 --> D2
  D1 -->|"[else]"| E2
  D2 -->|"[yes]"| E3
  D2 -->|"[else]"| End(["end"])
```

## Notes

- The child chooses the next episode on purpose; nothing chains on its own (J4).
- The owner's per-title allowance (UC39, J8) is set from the title details on the owner's
  account; its rules are specified in #316. J4 and J8 say "profile"; #316 decides per account.
- No typing: the profile picker and the posters work with arrows, OK and Back (NFR-15).
