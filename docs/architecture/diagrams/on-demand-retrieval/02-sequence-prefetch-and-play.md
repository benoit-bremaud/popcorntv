# Sequence diagram — on-demand retrieval — prefetch and play

> **Feature**: UC40 (SEQ-prefetch-and-play), slice 1
> **Requirements**: REQ-46–51, REQ-56, NFR-16
> **Related ADRs**: ADR-0034, ADR-0043, ADR-0044, ADR-0046

## Diagram

```mermaid
---
title: sd — Prefetch and play (SEQ-prefetch-and-play)
---
sequenceDiagram
  actor V as Viewer
  participant W as Web (sheet, player)
  participant API as Server routes
  participant SCH as Retrieval scheduler
  participant C as Retrieval cache
  participant S as Source (through the VPN)
  participant P as Playback (HLS)

  V->>W: open the film's sheet
  W->>API: POST /retrievals {kind, tmdbId}
  API->>SCH: request(prefetch priority)
  SCH->>S: search and pick the fastest conforming version
  S-->>SCH: versions and verdicts
  SCH->>C: reserve(start buffer target) [under the ceiling]
  API-->>W: 202 {retrievalId, verdict, target}
  par retrieval
    loop until the start buffer is verified
      S-->>C: pieces
      C->>C: verify each piece (ADR-0034)
    end
  and progress
    loop every second while the sheet is open
      W->>API: GET /retrievals/:id
      API-->>W: {verifiedBytes, target, warning}
      W->>W: fill the Play button
    end
  end
  alt button full
    V->>W: Play
  else early click
    V->>W: Play
    W->>API: POST /retrievals/:id/priority
    API->>SCH: raise to playback priority
    Note over W: stay on the sheet until the first frame
  end
  W->>API: POST /playback/sessions {retrievalId}
  API->>C: lease the generation
  API->>P: start from verified bytes
  P-->>W: playlist, first frame
  par playback
    P->>C: read verified pieces
  and rest of the file
    SCH->>S: retrieve the rest at playback priority
    S-->>C: pieces
  end
  opt seek into a missing part
    W->>API: seek(t)
    API->>SCH: retrieve around t first
    API-->>W: bounded wait, then frames
  end
  opt source or VPN down
    P-->>W: buffer runs out → paused "source unavailable"
    SCH->>S: retry with backoff
    S-->>C: pieces again
    P-->>W: resume by itself
  end
  V->>W: close the player
  W->>API: DELETE /playback/sessions/:id
  API->>C: release the lease, record lastPlaybackAt
  API->>SCH: stop the retrieval (bytes stay)
```

Route names are indicative: the HTTP contract is fixed in the slice 1 implementation issue, with
its zod schemas in `packages/shared`.
