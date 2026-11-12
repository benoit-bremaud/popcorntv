# Watch a prepared title

SEQ-play-prepared-title, UC33 design view. Recovery continues independently through SEQ-follow-wishlist. Existing file/HLS routes are reused only after their complete-file assumptions are addressed.

```mermaid
sequenceDiagram
  title sd — UC33 Watch a prepared title (backend)
  actor Viewer
  participant B as Bell and player
  participant C as Preparation coordinator
  participant K as Cache boundary
  participant S as Playback boundary
  Viewer->>B: Open notice and choose Play
  B->>C: Request exact target with authenticated profile
  C->>K: Reconcile generation and verified coverage
  K-->>C: Current content and resource evidence
  alt Authorized and currently ready
    C->>K: Pin content for playback lease
    K-->>C: Stable read lease or refusal
    alt Lease granted
      C->>S: Start supported playback with lease
      S-->>C: Session or bounded start failure
      C-->>B: Session or recoverable error
      loop While session active and wait deadline not exceeded
        B->>S: Read requested media range or segment
        S->>K: Read verified data or bounded wait
        K-->>S: Bytes or waiting or final completion
        S-->>B: Media or explicit waiting or failure
      end
      B->>S: Close session
      S->>K: Release lease
      K-->>S: Released
      S-->>B: Closed
    else Lease refused
      C-->>B: Preparation or capacity state
    end
  else Unauthorized or no longer ready
    C-->>B: Access refusal or current preparation state
  end
```

On start failure the playback boundary releases the lease. A disconnect, timeout or shutdown follows the same release guarantee. A seek outside verified coverage cannot read sparse holes. This view does not prescribe new endpoint names.
