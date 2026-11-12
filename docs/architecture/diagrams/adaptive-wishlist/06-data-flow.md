# Adaptive wishlist data flow

Level-1 DFD (not a UML type). Draft for #307. Every preference-bearing or credential-bearing edge is marked. External backend identity/policy remains unresolved in #308.

```mermaid
---
title: DFD — Adaptive wishlist (level 1)
---
flowchart LR
  U["Viewer browser"]
  E["External recovery service"]
  subgraph Trust["Server trust boundary"]
    P1(("1 Authorize interest"))
    P2(("2 Reconcile preparation"))
    P3(("3 Evaluate readiness"))
    P4(("4 Deliver notice and playback"))
    D1[("D1 Private interests and notices")]
    D2[("D2 Preparation state and cache")]
    D3[("D3 Server credentials")]
    P1 -.->|"PII: profile and wished target and parental policy"| D1
    D1 -.->|"PII: subscribed target"| P2
    P1 -->|"authorized target"| P2
    D3 -.->|"SECRET: backend credential"| P2
    P2 -->|"verified ranges and speed and metadata"| P3
    P2 -.->|"PII: selected target and source identity and media bytes"| D2
    D2 -->|"verified coverage evidence"| P3
    P3 -->|"readiness generation"| P4
    P4 -.->|"PII: profile notice and read state"| D1
    D1 -.->|"PII: private notices"| P4
    D2 -.->|"PII: selected media bytes"| P4
  end
  U -.->|"PII: session and profile and title choice"| P1
  P1 -.->|"PII: private tracking status"| U
  P2 -.->|"SECRET: backend credential and PII: target choice"| E
  E -.->|"PII: source identity and selected media bytes"| P2
  U -.->|"PII: session and selected notice or playback target"| P4
  P4 -.->|"PII: notices and chosen media"| U
```

Signed-in users may request their own wishes automatically when their account policy permits. Child policy is configured by the owner at invitation and applied across profiles. Anonymous and cross-profile requests are rejected. Credentials/service permissions must be explicitly accepted before replacing the old owner-only acquisition boundary.

Profile identities, wishes, playback progress and watch history must not be forwarded to the recovery service. External title/source choices remain sensitive viewing preferences even without a username. Session credentials remain same-origin. Server keys stay in configuration, never the browser or logs. Local processing serves the requested playback feature; this is a purpose statement, not a legal-basis determination. Existing notices expire after 90 days. Interest follows wishlist lifecycle; preparation/cache metadata retention requires the deferred policy with explicit bounds before production. Cache byte admission is mandatory immediately and does not authorize automatic deletion.
