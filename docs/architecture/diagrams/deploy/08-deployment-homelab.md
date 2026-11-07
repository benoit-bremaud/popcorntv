# Deployment diagram — homelab — PopCornTV on bb-homelab

> **Feature**: homelab deployment — [spec](../../specs/homelab-deploy.md) · **Related
> ADRs**: ADR-0013, ADR-0010 · **Issue**: #60, #46

## Context

Where each artifact runs once PopCornTV replaces Jellyfin on the owner's Raspberry Pi. It
refines the generic [auth deployment](../auth/08-deployment-prod.md) with the real host,
network and paths.

## Diagram

```mermaid
flowchart LR
  subgraph Client["«device» Browser (LAN or Tailscale)"]
    Web["web app"]
  end

  subgraph Pi["«device» bb-homelab — Raspberry Pi 5, aarch64, Docker"]
    subgraph Caddy["«container» bb-homelab-caddy — 443/tcp, tls internal"]
      Site["popcorntv.bb-homelab.local · CSP, HSTS · /api/* stripped"]
    end
    subgraph Net["«network» popcorntv 10.203.60.0/29"]
      App["«container» bb-homelab-popcorntv — Fastify :3000, no published port"]
    end
    Sync["«container» web-sync (one-shot, no network)"]
    WebVol[("«volume» popcorntv-web")]
    Data[("«folder» /mnt/appdata/popcorntv/data — SQLite, artwork, transcode")]
    Media[("«folder» /mnt/appdata/media, read-only")]
    Kuma["«container» bb-homelab-uptime-kuma"]
  end
  TMDB["«external» api.themoviedb.org"]

  Web -->|"HTTPS, one origin"| Site
  Site -->|"HTTP 10.203.60.3:3000"| App
  Site -->|"reads"| WebVol
  Sync -->|"copies /app/web"| WebVol
  App --> Data
  App --> Media
  App -->|"HTTPS"| TMDB
  Kuma -->|"GET /api/health"| Site
```

## Notes

- Caddy is `10.203.60.2` on the `popcorntv` network, the only `TRUST_PROXY` peer.
- `popcorntv` and `web-sync` run the same image tag, so web and API never drift.
- The nightly bb-homelab backup copies `data/backup/popcorntv.sqlite`.
