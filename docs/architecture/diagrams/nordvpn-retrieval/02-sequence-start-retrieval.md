# Sequence diagram — start isolated retrieval

This design-level sequence shows UC34 startup and refusal before exposing administration.

> **Feature:** #328 · **Source:** [Specification](../../specs/nordvpn-retrieval.md)
> **Realises:** UC34, REQ-38–42 · **Interaction:** SEQ-start-retrieval
> **See also:** [Deployment](08-deployment-local.md) · **Status:** implemented (#328); component-tested, runtime acceptance owner-run and pending on this head

```mermaid
sequenceDiagram
  title sd — UC34 Start isolated retrieval (local)
  actor O as Local operator
  participant C as Retrieval controller
  participant D as Docker
  participant G as Gluetun
  participant Q as qBittorrent
  O->>C: Start private empty installation
  C->>C: Validate private state, quota and image qualification
  alt Preconditions fail
    C->>D: Stop identifiable owned client before gateway
    D-->>C: Confirmed stop or categorical cleanup failure
    C-->>O: Categorical refusal; preserve private state
  else Preconditions pass
    C->>D: Create owned gateway with protected file
    D-->>C: Gateway identity
    C->>G: Await firewall and tunnel health (bounded)
    G-->>C: Health or timeout
    alt Gateway unhealthy
      C->>D: Stop owned resources and preserve state
      D-->>C: Confirmed cleanup or categorical failure
      C-->>O: Startup refused
    else Gateway healthy
      C->>D: Start non-root client in gateway namespace
      D-->>C: Client identity and effective configuration
      C->>Q: Authenticate and verify empty queue/settings
      Q-->>C: Authenticated observations
      C->>C: Verify namespace, limits and non-host egress
      alt Verification fails
        C->>D: Stop client before gateway
        D-->>C: Confirmed cleanup or categorical failure
        C-->>O: Startup refused
      else Verification passes
        C-->>O: Verified private administration available
      end
    end
  end
```

The controller is a local infrastructure tool, not a new application service.
WireGuard credentials cross only the read-only file mount shown in the deployment view;
API credentials stay in protected local state. Administration stays inside container loopback with no host publication. Immediate
packet denial on tunnel failure belongs to the firewall, independent of this startup sequence.
