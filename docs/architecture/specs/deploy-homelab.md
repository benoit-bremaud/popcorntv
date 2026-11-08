# Homelab deployment — PopCornTV replaces Jellyfin on bb-homelab

> **Feature**: homelab deployment — [deployment](../diagrams/deploy/08-deployment-prod.md)
> · **Issue**: #60 (includes #46) · **Related ADRs**: ADR-0013, ADR-0010

## 1. Requirements

- **R1** One HTTPS origin `https://popcorntv.bb-homelab.local` serves the web build and the
  API under `/api` (prefix stripped), to tailnet clients only (`tailnet_only`, bb-homelab
  ADR 0009); `/api/health` stays open for Uptime Kuma. No app port is published.
- **R2** Caddy sends HSTS, a strict CSP without inline script or style,
  `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy:
  same-origin`, `Permissions-Policy`, `nosniff` and `no-referrer` (#46, spec auth §5).
- **R3** The web build and the API come from the same image tag; hashed assets are cached
  for good and kept 30 days after an upgrade, `index.html` is revalidated.
- **R4** `TRUST_PROXY` is Caddy's fixed address `10.203.60.2` on the external
  `bb-homelab-proxy-popcorntv` /29 network, shared with Caddy only.
- **R5** Media are mounted read-only from `/mnt/appdata/media`; data live in
  `/mnt/appdata/popcorntv/data` and rebuildable caches in `/mnt/appdata/popcorntv/cache`,
  both owned by uid 1000; no bind mount creates its host path.
- **R6** The nightly bb-homelab backup archives `/app/data` with the container paused and
  pings a Kuma Push monitor; an upgrade starts with the same backup.
- **R7** Uptime Kuma probes `/api/health` through Caddy.
- **R8** Upgrades and rollbacks change one image tag; migrations run at start.
- **R9** The app container runs read-only, without capabilities, with `no-new-privileges`.

## 2. Cut-over from Jellyfin

1. Move the media to `/mnt/appdata/media`, deploy, create the owner, scan, enrich.
2. QA pass on local staging (`make staging-up`, #204) before the deploy: sign-in, catalog,
   direct play, HLS, subtitles, resume, headers; then a smoke check on the Pi after it.
3. Maintainerr: nothing to audit; it is not installed on bb-homelab and the owner decided on
   2026-11-07 not to install it. If it is ever installed, keep only rules not based on watch
   state, since its media server no longer sees the viewing done in PopCornTV
   (`docs/requirements/02-homelab-ecosystem.md`).
4. Household uses PopCornTV; Jellyfin stays stopped two weeks as the fallback, then is
   removed from bb-homelab.

## 3. Rollback

Set the previous image tag (restore the pre-upgrade archive if a migration ran), or start
Jellyfin again with its media mount pointed at `/mnt/appdata/media`.
