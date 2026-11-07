# Deployment diagram — deploy — PopCornTV in production on bb-homelab

> **Feature**: homelab deployment — [spec](../../specs/deploy-homelab.md) · **Related
> ADRs**: ADR-0013, ADR-0010 · **Issue**: #60, #46

## Context

Where each artifact runs once PopCornTV replaces Jellyfin on the owner's Raspberry Pi. It
refines the generic [auth deployment](../auth/08-deployment-prod.md) with the real host,
networks and paths.

## Diagram

```mermaid
flowchart LR
  subgraph Client["«device» Browser on the tailnet"]
    Web["web app"]
  end

  subgraph Pi["«device» bb-homelab — Raspberry Pi 5, aarch64, Docker"]
    subgraph Caddy["«container» bb-homelab-caddy — 443/tcp on loopback + tailnet IP, tls internal"]
      Site["popcorntv.bb-homelab.local · tailnet_only · CSP, HSTS · /api/* stripped"]
    end
    subgraph Net["«network» bb-homelab-proxy-popcorntv 10.203.60.0/29"]
      App["«container» bb-homelab-popcorntv — Fastify :3000, no published port"]
    end
    Sync["«container» web-sync (one-shot, no network)"]
    WebVol[("«volume» popcorntv-web")]
    Data[("«folder» /mnt/appdata/popcorntv/data — SQLite, artwork, transcode")]
    Media[("«folder» /mnt/appdata/media, read-only")]
    Kuma["«container» bb-homelab-uptime-kuma"]
    Backup["«cron» appdata-backup.sh 03:25"]
  end
  TMDB["«external» api.themoviedb.org"]

  Web -->|"HTTPS over Tailscale, one origin"| Site
  Site -->|"HTTP 10.203.60.3:3000"| App
  Site -->|"reads"| WebVol
  Sync -->|"copies /app/web"| WebVol
  App --> Data
  App --> Media
  App -->|"HTTPS"| TMDB
  Kuma -->|"GET /api/health"| Site
  Backup -->|"pause + docker cp /app/data"| App
```

## Notes

- Caddy is `10.203.60.2` on the proxy network, the only `TRUST_PROXY` peer.
- `popcorntv` and `web-sync` run the same image tag, so web and API never drift.
- The network and the volume are external, created once by hand, so Caddy and PopCornTV
  can each be torn down alone.
