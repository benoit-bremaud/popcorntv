# Deployment diagram — deploy — PopCornTV local staging on the dev machine

> **Feature**: local staging — [spec](../../specs/deploy-homelab.md) · **Related ADRs**:
> ADR-0013 · **Issue**: #204

## Context

Where QA passes run before the owner decides a Pi deploy (owner rule 2026-11-08). It mirrors
the [production deployment](08-deployment-prod.md) on the dev machine: same image, same
`web-sync` one-shot, same Caddy site block over `tls internal`. Derogation to the global
staging rule (staging on the prod platform): the Pi is the only prod host and a build there
takes about 15 minutes, so staging runs the same image on the dev machine instead.

## Diagram

```mermaid
flowchart LR
  subgraph Dev["«device» dev machine — x86_64, Docker"]
    Browser["«device» browser / qa-tester"]
    subgraph Caddy["«container» caddy — 127.0.0.1:8443, tls internal"]
      Site["localhost:8443 · CSP, HSTS · /api/* stripped"]
    end
    subgraph Net["«network» popcorntv-staging 10.203.204.0/24"]
      App["«container» popcorntv:staging-&lt;sha&gt; — Fastify :3000, no published port"]
    end
    Sync["«container» web-sync (one-shot, no network)"]
    WebVol[("«volume» web")]
    Data[("«volume» data — SQLite")]
    Cache[("«volume» cache — artwork, transcode")]
    Media[("«folder» ./media or STAGING_MEDIA, read-only")]
  end
  Browser -->|HTTPS| Site
  Site -->|HTTP /api| App
  Sync --> WebVol
  Site --> WebVol
  App --> Data
  App --> Cache
  App --> Media
```

## Notes

- `make staging-up` builds `git archive HEAD`, so the tag always names the code inside it.
- Differences from production, on purpose: named volumes instead of the HDD bind mounts, no
  `tailnet_only` (loopback only), the local CA regenerated at each start.
