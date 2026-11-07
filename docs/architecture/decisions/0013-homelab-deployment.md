# ADR-0013 — Homelab deployment on bb-homelab

- Status: accepted (owner, #60 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [homelab-deploy](../specs/homelab-deploy.md), ADR-0010, issues #60, #46

## Context

PopCornTV replaces Jellyfin on bb-homelab, a Raspberry Pi 5 (aarch64) reached over the LAN
and Tailscale, with no public domain. A Caddy (`tls internal`, `*.bb-homelab.local`) already
fronts the other services, and a nightly backup covers n8n and Vaultwarden. Jellyfin is used
on the LAN only and is already stopped. The web build and `/api` must share one origin
(`Cross-Origin-Resource-Policy: same-origin`, #46). Scores 0–5, weights /100, totals /500;
scores are estimates.

## Decisions

### 1. Exposure

| Criterion (weight) | A. bb-homelab Caddy | B. Own Caddy in popcorntv | C. Tailscale Serve |
|---|---|---|---|
| Fits the homelab (30) | 5 — same pattern as the other services | 1 — second proxy, port 443 clash | 3 — a new pattern for one app |
| Security, CSP / HSTS (25) | 4 — headers in Caddy, internal CA | 4 | 5 — public CA certificate |
| Effort (25) | 4 — one block, one service | 2 — two proxies | 3 — sidecar and auth key |
| Household devices (20) | 3 — trust the internal CA | 3 | 5 — nothing to install |
| **Total** | **410** | **240** | **390** |

Sensitivity: devices at 35 and fit at 15 makes C first (420 vs 395). **Chosen: A.**

### 2. Where the configuration lives

A. Live compose and Caddy block in bb-homelab, reference copy and docs in popcorntv (430);
B. everything in popcorntv, cloned on the Pi (350, two sources of truth). **Chosen: A.**

### 3. Delivering the web build

| Criterion (weight) | A. rsync `dist` | B. In the image, one-shot copy to a volume | C. Fastify serves `dist` |
|---|---|---|---|
| Web and API in step (35) | 2 — manual step | 5 — same image tag | 5 |
| No code change (25) | 5 | 5 | 1 — new server dependency and headers |
| Simplicity (25) | 5 | 3 — one more service | 3 |
| Caddy keeps static serving (15) | 5 | 5 | 2 |
| **Total** | **380** | **420** | **300** |

**Chosen: B.**

### 4. Database backup

A. `better-sqlite3` online backup inside the nightly bb-homelab job (440); B. a PopCornTV
cron of its own (330); C. none, rescan instead (200, accounts and progress lost).
**Chosen: A.**

### 5. Media path and Jellyfin retirement

Media move from `/mnt/appdata/jellyfin/media` to `/mnt/appdata/media` before the first scan
(440 vs keeping the Jellyfin path 330: removing Jellyfin must not touch the media). Jellyfin
stays stopped for two weeks as the fallback, then is removed (430 vs immediate removal 340).

## Consequences

- The image now builds `apps/web` too; build time and build-stage size grow.
- Each client trusts the bb-homelab internal CA, as for the other services.
- The image is built on the Pi from a release tag; no registry is needed.
- `TRUST_PROXY` names Caddy's fixed address on a /29 network that holds only Caddy and the app.
