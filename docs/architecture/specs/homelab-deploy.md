# Homelab deployment — PopCornTV replaces Jellyfin on bb-homelab

> **Feature**: homelab deployment — [deployment](../diagrams/deploy/08-deployment-homelab.md)
> · **Issue**: #60 (includes #46) · **Related ADRs**: ADR-0013, ADR-0010

## 1. Requirements

- **R1** One HTTPS origin `https://popcorntv.bb-homelab.local` serves the web build and the
  API under `/api` (prefix stripped). No app port is published on the host.
- **R2** Caddy sends HSTS, a strict CSP without inline script or style,
  `frame-ancestors 'none'`, `Permissions-Policy`, `nosniff` and `no-referrer` (#46).
- **R3** The web build and the API come from the same image tag.
- **R4** `TRUST_PROXY` is Caddy's fixed address `10.203.60.2` on the `popcorntv` /29 network.
- **R5** Media are mounted read-only from `/mnt/appdata/media`; data live in
  `/mnt/appdata/popcorntv/data`, owned by uid 1000.
- **R6** The nightly backup holds a consistent copy of the SQLite database.
- **R7** Uptime Kuma probes `/api/health` through Caddy.
- **R8** Upgrades and rollbacks change one image tag; migrations run at start.

## 2. Cut-over from Jellyfin

1. Move the media to `/mnt/appdata/media`, deploy, create the owner, scan, enrich.
2. QA pass on the Pi: sign-in, catalog, direct play, HLS, subtitles, resume, headers.
3. Household uses PopCornTV; Jellyfin stays stopped two weeks as the fallback, then is
   removed from bb-homelab.

Watch history import, the Tdarr and Bazarr flows and the Maintainerr audit
(`docs/requirements/02-homelab-ecosystem.md`) are follow-up issues; Maintainerr runs on Plex,
which keeps running.

## 3. Rollback

Set the previous image tag (restore the backup if a migration ran), or start Jellyfin again
with its media mount pointed at `/mnt/appdata/media`.
