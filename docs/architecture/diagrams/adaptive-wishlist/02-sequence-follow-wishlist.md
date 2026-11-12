# Follow a wishlist title

SEQ-follow-wishlist, design responsibility view for UC32. All new participants are proposed responsibilities, not implemented classes. Profile/interest data stays local. A due tick is internal to the coordinator.

```mermaid
sequenceDiagram
  title sd — UC32 Follow a title until playable (backend)
  actor Viewer
  participant W as Wishlist
  participant C as Preparation coordinator
  participant R as Recovery boundary
  participant P as Readiness policy
  participant N as Notification store
  Viewer->>W: Add private title interest
  W->>C: Link private interest and automatic preparation intent
  C-->>W: Persisted preparation state
  W-->>Viewer: Saved wishlist entry
  opt Authorized target due and run capacity available
    C->>R: Reconcile existing request or search once
    R-->>C: Accepted source or pending or sanitized error
  end
  loop Bounded observations while preparation active and server running
    C->>R: Observe verified ranges and throughput
    R-->>C: Source generation and telemetry
    C->>P: Evaluate validated coverage and resources
    P-->>C: Waiting or ready or full-file-only
    opt New eligible movie or episode readiness generation
      C->>N: Atomically persist readiness and unique profile notices
      N-->>C: Committed or already recorded
    end
  end
```

No-source results retain a daily due date, not an active-transfer poll. Transient failure uses persisted backoff. Unknown upstream write outcomes are reconciled before another write. Atomicity requires readiness and notification persistence in the same local transaction or an equivalently proven durable reconciliation contract, to be detailed in #309/#314.
