# Deploying PopCornTV on bb-homelab

How to install, upgrade, back up and roll back PopCornTV on the owner's Raspberry Pi 5
(`bb-homelab`, aarch64), where it replaces Jellyfin. Decisions: ADR-0013; requirements: spec
`docs/architecture/specs/homelab-deploy.md`; diagram:
`docs/architecture/diagrams/deploy/08-deployment-homelab.md`.

## Layout on the Pi

| Path | Content | Mode |
|---|---|---|
| `/mnt/appdata/media` | movie and series folders (moved from `/mnt/appdata/jellyfin/media`) | read-only in the app |
| `/mnt/appdata/popcorntv/data` | SQLite database, artwork, transcode folders, backups | owned by uid 1000 |
| volume `popcorntv-web` | web build copied from the image by `web-sync` | read-only in Caddy |

The files in this folder are the reference; the live compose service and Caddy block live in
the `bb-homelab` repository.

## First install

1. Move the media out of the Jellyfin tree (same disk, instant) and create the data folder:

   ```bash
   sudo mv /mnt/appdata/jellyfin/media /mnt/appdata/media
   sudo install -d -o 1000 -g 1000 /mnt/appdata/popcorntv/data
   ```

2. Build the image on the Pi from a release tag (arm64, no registry):

   ```bash
   git clone https://github.com/benoit-bremaud/popcorntv.git && cd popcorntv
   git checkout <tag> && docker build -t popcorntv:<tag> .
   ```

3. Copy `popcorntv.env.example` to `popcorntv.env` beside the live compose file and set the
   TMDB token. Set `POPCORNTV_VERSION=<tag>` in the compose `.env`.
4. In bb-homelab: attach Caddy to the `popcorntv` network at `10.203.60.2`, mount
   `popcorntv-web` read-only at `/srv/popcorntv-web`, add the site block of `Caddyfile`,
   then `docker compose up -d`.
5. Add `popcorntv.bb-homelab.local` to the clients' hosts file (as for the other services).
6. Read the one-time setup link in `docker logs bb-homelab-popcorntv`, create the owner
   account, add the libraries under `/app/media`, run a scan.
7. Uptime Kuma: HTTP monitor on `https://popcorntv.bb-homelab.local/api/health`.

## Upgrade

Build the new tag, change `POPCORNTV_VERSION`, `docker compose up -d`. `web-sync` refreshes
the web build before the app starts; migrations run at start. Roll back by setting the
previous tag (restore the database backup first if the new version migrated it).

## Backup

The nightly bb-homelab backup takes a consistent copy of the database through the app's own
`better-sqlite3`, then copies `/mnt/appdata/popcorntv/data/backup/` with the other backups:

```bash
docker exec bb-homelab-popcorntv node -e "require('better-sqlite3')('data/popcorntv.sqlite',{readonly:true}).backup('data/backup/popcorntv.sqlite').then(()=>process.exit(0),()=>process.exit(1))"
```

Artwork and transcode folders are rebuilt by a scan and are not backed up.

## Jellyfin retirement

Jellyfin stays stopped with its config for two weeks after the cut-over as the fallback
(point its media mount at `/mnt/appdata/media` to start it again), then its service and
`/mnt/appdata/jellyfin` are removed from bb-homelab.
