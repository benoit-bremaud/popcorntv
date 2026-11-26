# Component diagram — on-demand retrieval

> **Feature**: epic #306 redefined by #434
> **Related ADRs**: ADR-0028, ADR-0034, ADR-0043, ADR-0044, ADR-0047

## Diagram

```mermaid
---
title: cmp — On-demand retrieval
---
flowchart LR
  subgraph Web ["apps/web"]
    Sheet["[component] Sheet + Play button"]
    Player["[component] Player"]
    Bell["[component] Bell"]
  end
  subgraph Shared ["packages/shared"]
    Rules["[component] Retrieval rules (pure): start buffer, version verdict"]
  end
  subgraph Server ["apps/server"]
    Routes["[component] Retrieval routes"]
    Sched["[component] Retrieval scheduler"]
    Cache["[component] Retrieval cache"]
    Sweep["[component] Deletion sweep"]
    SrcPort["[component] Source adapter"]
    Sessions["[component] Playback sessions"]
    Notif["[component] Notifications + channels"]
  end
  VPN[["[node] VPN namespace (#328)"]]
  Push[["Web Push service"]]
  Mail[["SMTP relay"]]

  Sheet -->|"HTTP /retrievals"| Routes
  Player -->|"HTTP /playback"| Sessions
  Bell -->|"HTTP /notifications"| Notif
  Routes --> Sched
  Sched --> Cache
  Sched --> SrcPort
  Sched --> Rules
  Sessions --> Cache
  Sweep --> Cache
  SrcPort -->|"only egress for retrieval"| VPN
  Notif -->|"egress"| Push
  Notif -->|"egress"| Mail
  Sheet --> Rules
```

## Responsibilities

- **Retrieval rules**: pure functions shared by server and web; no IO.
- **Scheduler**: priorities, quotas, bandwidth cap; the only component that talks to the source
  adapter.
- **Cache**: generations, verified ranges, reservations under the ceiling, eviction, leases.
- **Deletion sweep**: 6 h purge, 48 h deletion, favourite trim; serial timer.
- **Source adapter**: search and retrieval through the VPN namespace; replaceable by a test double
  (NFR-17); never sees a profile.
- **Notifications + channels**: bell (existing), Web Push and e-mail (slice 3).

Dependency rule: routes and sweep depend on the cache and the scheduler; nothing in
`packages/shared` imports the server; the source adapter is injected.
