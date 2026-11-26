# Deployment diagram — persistent VPN retrieval

This local view makes the sole public egress path and separate storage boundary explicit.

> **Feature:** #328 · **Source:** [Specification](../../specs/nordvpn-retrieval.md)
> **Realises:** REQ-38–42 · **Status:** implemented (#328); component-tested, runtime acceptance owner-run and pending on this head

## Diagram

```mermaid
---
title: dep — Persistent VPN retrieval (local)
---
flowchart LR
  subgraph Host["«device» Operator workstation"]
    Operator["«executionEnvironment» Local operator"]
    subgraph Docker["«executionEnvironment» Docker"]
      subgraph Namespace["«executionEnvironment» Dedicated VPN namespace"]
        Gateway["«artifact» Qualified Gluetun image"]
        Client["«artifact» Qualified qBittorrent image"]
      end
    end
    Secret["«artifact» Private WireGuard file"]
    Config["«artifact» Private client configuration"]
    Cache["«artifact» Quota-backed retrieval filesystem"]
  end
  VPN["«executionEnvironment» NordVPN endpoint"]
  Fixture["«executionEnvironment» Owned acceptance endpoint"]
  Operator ---|"Docker-exec authenticated loopback HTTP :8080"| Client
  Gateway ---|"Shared namespace HTTP :8080"| Client
  Gateway ---|"WireGuard UDP configured endpoint port"| VPN
  VPN ---|"HTTPS :443 acceptance traffic"| Fixture
  Secret ---|"Read-only mount"| Gateway
  Config ---|"Private read-write mount"| Client
  Cache ---|"Bounded read-write mount"| Client
```

## Notes

Mermaid approximates UML deployment notation. The operator README records qualified immutable image identities. No host port is published. No independent client network, library mount, public
admin port, discovery network or player route is present. The external acceptance endpoint
is controlled test traffic, not a configured acquisition source. The shared namespace's
firewall must reject all client egress outside the tunnel, including during restart.
