# Deploying PopCornTV on bb-homelab

How to install, upgrade, back up and roll back PopCornTV on the owner's Raspberry Pi 5
(`bb-homelab`, aarch64), where it replaces Jellyfin. Decisions: ADR-0013; requirements: spec
`docs/architecture/specs/deploy-homelab.md`; diagram:
`docs/architecture/diagrams/deploy/08-deployment-prod.md`.

PopCornTV is reachable from the tailnet only, like every bb-homelab service (bb-homelab ADR
0007, 0009): clients reach `popcorntv.bb-homelab.local` through Tailscale and trust the
bb-homelab internal CA.

## Layout on the Pi

| Path | Content | Mode |
|---|---|---|
| `/mnt/appdata/media` | movie and series folders, moved from `/mnt/appdata/jellyfin/media`; interim until `/mnt/media` (bb-homelab #47) | read-only in the app |
| `/mnt/appdata/popcorntv/data` | SQLite database (backed up) | owned by uid 1000 |
| `/mnt/appdata/popcorntv/cache` | artwork and transcode folders, rebuilt by a scan or a Play | owned by uid 1000 |
| volume `popcorntv-web` | web build copied from the image by `web-sync` | read-only in Caddy |

The files in this folder are the reference; the live compose service and Caddy block live in
the `bb-homelab` repository.

## First install

1. Move the media out of the Jellyfin tree (same disk, instant) and create the data folder:

   ```bash
   sudo mv /mnt/appdata/jellyfin/media /mnt/appdata/media
   sudo install -d -o 1000 -g 1000 /mnt/appdata/popcorntv/data /mnt/appdata/popcorntv/cache
   ```

   Update the upload paths in the bb-homelab docs that still name the Jellyfin media tree.

2. Build the image on the Pi from a release tag, or from a `main` commit SHA until the first
   release is cut (skill `release-tag`); no registry is needed:

   ```bash
   git clone https://github.com/benoit-bremaud/popcorntv.git && cd popcorntv
   git checkout <tag-or-sha> && docker build -t popcorntv:<tag-or-sha> .
   ```

3. Create the shared network and volume once:

   ```bash
   docker network create --subnet 10.203.60.0/29 bb-homelab-proxy-popcorntv
   docker volume create popcorntv-web
   ```

4. Copy `popcorntv.env.example` to `popcorntv.env` beside the live compose file, set the
   TMDB token, `chmod 600 popcorntv.env`. Set `POPCORNTV_VERSION=<tag-or-sha>` in the
   compose `.env`, then `docker compose up -d`.
5. In the Caddy compose: join `bb-homelab-proxy-popcorntv` (external) at `10.203.60.2`,
   mount `popcorntv-web` (external) read-only at `/srv/popcorntv-web`, add
   `popcorntv.bb-homelab.local` to the `proxy-uptime-kuma` aliases. Add the site block of
   `Caddyfile`, then recreate Caddy.
6. Read the one-time setup link in `docker logs bb-homelab-popcorntv`, create the owner
   account, add the libraries under `/app/media`, run a scan.
7. Uptime Kuma: HTTP monitor on `https://popcorntv.bb-homelab.local/api/health`.

## Backup

The nightly bb-homelab job (`storage/APPDATA-BACKUP.md`) pauses the container, copies
`/app/data` and pings a Kuma Push monitor. Create the Push monitor `backup-popcorntv`, store
its URL in `~/.config/bb-homelab/kuma-push-popcorntv`, then add to `crontab -e`:

```cron
25 3 * * * mkdir -p /home/benoit/backups/popcorntv && KUMA_PUSH_URL="$(cat /home/benoit/.config/bb-homelab/kuma-push-popcorntv)" /home/benoit/bb-homelab/storage/scripts/appdata-backup.sh popcorntv bb-homelab-popcorntv /app/data >> /home/benoit/backups/popcorntv/backup.log 2>&1
```

The pause makes the database and its WAL a consistent set. Caches and media are not backed
up here.

## Upgrade

1. Run the backup line above by hand.
2. Build the new tag, change `POPCORNTV_VERSION`, `docker compose up -d`. `web-sync` copies
   the new web build before the app starts; migrations run at start.

Roll back by setting the previous tag; if the new version migrated the database, restore
the archive taken in step 1 first: stop the app, put back `popcorntv.sqlite` with its
`-wal` and `-shm` files together (bb-homelab `storage/APPDATA-BACKUP.md`, restore section),
then start it.

## Jellyfin retirement

Jellyfin stays stopped with its config for two weeks after the cut-over as the fallback
(point its media mount at `/mnt/appdata/media` to start it again), then its service, its
proxy network and `/mnt/appdata/jellyfin` are removed from bb-homelab.
