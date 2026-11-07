# ADR-0013 — Homelab deployment on bb-homelab

- Status: accepted (owner, #60 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [deploy-homelab](../specs/deploy-homelab.md), ADR-0010, issues #60, #46

## Context

PopCornTV replaces Jellyfin on bb-homelab, a Raspberry Pi 5 (aarch64) reachable from the
tailnet only (bb-homelab ADR 0007, 0009), with no public domain. A Caddy (`tls internal`,
`*.bb-homelab.local`, `tailnet_only` guard) fronts every service over one proxy network per
backend, and a nightly job backs up n8n, Vaultwarden, Caddy, Uptime Kuma and Jellyfin.
Jellyfin is used at home only and is already stopped. The web build and `/api` must share
one origin (`Cross-Origin-Resource-Policy: same-origin`, #46). Scores 0–5, weights /100,
totals /500; scores are estimates.

## Decisions

### 1. Exposure

| Criterion (weight) | A. bb-homelab Caddy | B. Own Caddy in popcorntv | C. Tailscale Serve |
|---|---|---|---|
| Fits the homelab (30) | 5 — same pattern as the other services | 1 — second proxy, port 443 clash | 3 — a new pattern for one app |
| Security, CSP / HSTS (25) | 4 — headers and tailnet guard in Caddy, internal CA | 4 | 5 — public CA certificate |
| Effort (25) | 4 — one block, one service | 2 — two proxies | 3 — sidecar and auth key |
| Household devices (20) | 3 — trust the internal CA | 3 | 5 — nothing to install |
| **Total** | **410** | **240** | **390** |

Sensitivity: devices at 35 and fit at 15 makes C first (420 vs 380). **Chosen: A.**

### 2. Where the configuration lives

| Criterion (weight) | A. Live in bb-homelab, reference in popcorntv | B. All in popcorntv, cloned on the Pi |
|---|---|---|
| One source of truth per concern (40) | 5 — host config with the host | 2 — host config split across two repos |
| Fits bb-homelab rules (30) | 5 — networks, backups, Caddy in one place | 2 — bypasses them |
| Effort (30) | 3 — two PRs per change | 5 — one repo |
| **Total** | **440** | **290** |

**Chosen: A.**

### 3. Delivering the web build

| Criterion (weight) | A. rsync `dist` | B. In the image, one-shot copy to a volume | C. Fastify serves `dist` |
|---|---|---|---|
| Web and API in step (35) | 2 — manual step | 5 — same image tag | 5 |
| No code change (25) | 5 | 5 | 1 — new server dependency and headers |
| Simplicity (25) | 5 | 3 — one more service | 3 |
| Caddy keeps static serving (15) | 5 | 5 | 2 |
| **Total** | **395** | **450** | **305** |

**Chosen: B.**

### 4. Database backup

| Criterion (weight) | A. bb-homelab `appdata-backup.sh` | B. A PopCornTV cron of its own | C. None, rescan |
|---|---|---|---|
| Accounts and progress safe (40) | 5 — paused, consistent copy | 5 | 0 — lost |
| Monitored (30) | 5 — Kuma Push like the others | 2 — to build | 0 |
| Effort (30) | 5 — one cron line | 2 — a script | 5 |
| **Total** | **500** | **320** | **150** |

**Chosen: A.**

### 5. Media path and Jellyfin retirement

| Criterion (weight) | A. Move to `/mnt/appdata/media` | B. Keep `/mnt/appdata/jellyfin/media` |
|---|---|---|
| Removing Jellyfin cannot touch the media (50) | 5 | 1 |
| Effort and risk (30) | 4 — one `mv` on the same disk, before the first scan | 5 |
| Fits Pattern Y (20) | 2 — interim until `/mnt/media` (bb-homelab #47) | 2 — same interim state |
| **Total** | **410** | **240** |

| Criterion (weight) | A. Remove Jellyfin after two weeks | B. Remove at once |
|---|---|---|
| Rollback available (60) | 5 | 0 |
| Disk and upkeep (40) | 3 — stopped, config kept | 5 |
| **Total** | **420** | **200** |

**Chosen: A and A.**

## Consequences

- The image now builds `apps/web` too; build time and build-stage size grow.
- Each client trusts the bb-homelab internal CA, as for the other services. Unlike
  Jellyfin, there is no direct port for devices that cannot install it.
- The image is built on the Pi from a release tag or a `main` SHA; no registry is needed.
- `TRUST_PROXY` names Caddy's fixed address on a /29 network shared with Caddy only.
