# Data flow diagram — on-demand retrieval

> **Feature**: epic #306 redefined by #434 — trust boundaries and egress
> **Requirements**: REQ-55, REQ-56, NFR-18, NFR-19
> **Related ADRs**: ADR-0021, ADR-0028, ADR-0034, ADR-0047

## Diagram

```mermaid
---
title: dfd — On-demand retrieval
---
flowchart LR
  Viewer(["Viewer (browser)"])
  Owner(["Owner (admin)"])
  subgraph Host ["Trust boundary: PopCornTV host"]
    P1(("1 Retrieval routes"))
    P2(("2 Scheduler and source adapter"))
    P3(("3 Probe and verify"))
    P4(("4 Playback"))
    P5(("5 Sweep"))
    P6(("6 Notifications"))
    D1[("D1 SQLite: retrievals, leases, stats")]
    D2[("D2 RETRIEVAL_DIR: generations")]
    D3[("D3 MEDIA_ROOT (read only, never deleted)")]
  end
  subgraph VPNZone ["Trust boundary: VPN namespace"]
    Src(["Source"])
  end
  Push(["Web Push service"])
  Mail(["SMTP relay"])

  Viewer -->|"title id, version choice"| P1
  P1 -->|"retrieval request"| D1
  P1 --> P2
  P2 -->|"title identity only"| Src
  Src -->|"untrusted pieces"| P3
  P3 -->|"verified pieces"| D2
  D2 --> P4
  D3 --> P4
  P4 -->|"HLS segments"| Viewer
  P5 -->|"delete, trim"| D2
  P5 --> D1
  D1 --> P6
  P6 -->|"title, reason (no history)"| Push
  P6 -->|"title, reason (no history)"| Mail
  D1 -->|"anonymous statistics"| Owner
```

## Threats and controls

| Flow | Threat | Control |
|---|---|---|
| Source → 3 | Malicious or mislabelled file | Only video and subtitle files; ffprobe with `localInputArgs`; nothing executed (REQ-55, ADR-0028) |
| Source → 3 | Corrupt or substituted bytes | Piece digests, generation binding (ADR-0034) |
| 2 → Source | Leak outside the VPN | Kill switch: no VPN, no egress (REQ-56, #328) |
| 2 → Source | Profile data leak | Title identity only (NFR-18) |
| 5 → D2/D3 | Deleting the owner's library | Sweep confined to `RETRIEVAL_DIR`; `MEDIA_ROOT` read only |
| 6 → Push/Mail | Watch history leak | Message carries the title and the reason only (ADR-0047) |
| D1 → Owner | Nominative statistics | Statistics anonymous; history nominative with members informed (NFR-19) |
