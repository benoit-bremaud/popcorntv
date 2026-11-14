# Sequence diagram — signed local gate

This interaction shows when a checked commit becomes eligible for an exact-head merge.

> **Feature:** #329 — signed local gate
> **Source spec:** [Local gate protocol](../../specs/local-gate-protocol.md)
> **Realises:** REQ-30–32 · **ID:** SEQ-attest-local-gate
> **Decisions captured:** owner-accepted two-PR trust bootstrap and primary signing identity

## Context

The sequence starts after the signer trust store has merged to main. It covers one operator
and one gate run. GitHub is metadata/transport only; checks execute on the local machine.

## Diagram

```mermaid
sequenceDiagram
  title sd — Verify and merge a published commit
  actor O as Owner
  participant G as Local gate
  participant C as Local checks
  participant S as SSH signer
  participant R as Canonical GitHub repository
  O->>G: gate()
  G->>R: Fetch trusted main and published head
  R-->>G: Trusted signers and origin refs
  G->>G: Acquire repository lock and verify clean published commit
  G->>R: Set exact-head gate pending
  R-->>G: Pending confirmed before checks start
  G->>C: Run all required checks
  C-->>G: Results and redacted diagnostics
  alt Required check fails or is skipped
    G->>R: Set gate failure if reachable
    G-->>O: Nonzero exit with retained evidence
  else Every required check passes
    G->>G: Recheck clean unchanged head
    G->>S: Sign repository and commit payload
    S-->>G: SSH signature
    G->>G: Verify using trusted main signers
    G->>R: Publish verified note without force
    R-->>G: Note published
    G->>R: Set exact-head gate success
    G-->>O: Gate complete
  end
  O->>G: merge(PR)
  G->>G: Acquire same repository lock
  G->>R: Read fresh PR head, note, main and status
  R-->>G: Current verification inputs
  G->>G: Verify signature, repository, SHA and status
  alt All merge predicates hold
    G->>R: Squash merge with match-head-commit
    R-->>G: Merged or head-race rejection
  else Missing, forged, stale or failed evidence
    G-->>O: Refuse merge
  end
```

## Notes

Any publication, signing or verification error ends the gate without success. The
specification defines bounded note-ref retries and unsupported cross-machine concurrency.
The future squash commit requires fresh verification before any deployment.
Gate and merge hold the same lock through their final response, preventing a local rerun
from racing a merge's status read. Pending publication failure aborts before checks and
does not revoke already valid remote evidence.
