# PopCornTV

Self-hosted media server and web player, built from scratch. Takes the best of Jellyfin
(free, self-hosted, no cloud account), Plex (automatic library scan with posters, synopses
and cast) and Netflix (row-based browsing, resume playback, next episode, one profile per
person) — and nothing else.

PopCornTV serves **your own media files**. It ships no content source.

## Status

MVP in progress (milestone v0.1.0). Done: library scan (issue #3) — register a media
folder, walk it, parse Plex / Jellyfin file names, probe streams with `ffprobe`, persist
in SQLite. The conception (requirements, UML, ADRs) precedes every brick, per the working
rules in [CLAUDE.md](CLAUDE.md).

## Stack

All-TypeScript pnpm monorepo (ADR-0001):

| Package           | Role                                       |
| ----------------- | ------------------------------------------ |
| `apps/server`     | Fastify API, library scan, FFmpeg control  |
| `apps/web`        | React + Vite web player                    |
| `packages/shared` | Types and contracts shared by both         |

Runtime: Node ≥ 22, pnpm, FFmpeg on the host (or in the Docker image), SQLite via Drizzle.

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in TMDB_API_KEY; PUBLIC_URL is required
pnpm dev:server              # http://localhost:3000  (GET /health); builds packages/shared first
pnpm dev:web                 # http://localhost:5173; /api proxied to API_URL (default :3000)
```

### First start: the owner account

Every route but `/health`, `GET /auth/status`, `POST /auth/setup` and `POST /auth/session`
needs an account. On a fresh database the server logs
a one-time setup link (`PUBLIC_URL/#/setup/<token>`, valid one hour, a new one at each
start); open it to create the owner account. The owner then invites the household (next
lot of #18). `PUBLIC_URL` is the one origin every browser uses — `http://localhost:5173` in
dev, the HTTPS origin of the reverse proxy in production (it decides the cookie flags and
the CSRF check). Design: [accounts spec](docs/architecture/specs/auth.md),
[ADR-0010](docs/architecture/decisions/0010-accounts-and-sessions.md).

Quality commands: `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` ·
`pnpm coverage` · `pnpm build`.

### Scan a media folder

Sign in first (owner account) and keep the session cookie:

```bash
curl -c jar -X POST localhost:3000/auth/session -H 'content-type: application/json' \
  -d '{"username":"<owner>","password":"<password>"}'
curl -b jar -X POST localhost:3000/libraries -H 'content-type: application/json' \
  -d '{"name":"Films","rootPath":"/absolute/path/under/MEDIA_ROOT/films","kind":"films"}'
curl -b jar -X POST localhost:3000/libraries/<id>/scan     # {added, updated, removed, skipped[], metadata}
curl -b jar localhost:3000/libraries/<id>/media            # films / episodes with streams + metadata
```

Every library is also rescanned every `SCAN_INTERVAL_MIN` minutes (default 60, `0` disables),
so files added by hand show up without a manual scan.

### Metadata from TMDB

Set `TMDB_API_KEY` to your free **API Read Access Token** (the long `eyJ…` token from
<https://www.themoviedb.org/settings/api>; the short v3 key is not accepted) and every scan
enriches the new titles: official
title, synopsis, genres, release date, runtime, rating, top cast, poster and backdrop. The
images are cached under `ARTWORK_DIR` (default `data/artwork`) and served by
`GET /artwork/<file>`, so the browser never contacts TMDB. Only a title, a year or the
`[tmdbid-…]` / `[imdbid-…]` tag of a file name is ever sent. `TMDB_LANGUAGE` (default
`en-US`) picks the language of titles and synopses.

```bash
curl -b jar -X POST localhost:3000/libraries/<id>/enrich   # titles not looked up yet
curl -b jar -X POST localhost:3000/libraries/<id>/enrich -H 'content-type: application/json' \
  -d '{"refresh":true}'                             # re-fetch every title
```

Without a key the server starts anyway (`metadata: null` in the scan report — also null
when the post-scan enrichment could not run, see the log — and `409 tmdb_not_configured`
on `/enrich`). Design: [UC2 spec](docs/architecture/specs/tmdb-metadata.md),
[ADR-0003](docs/architecture/decisions/0003-tmdb-metadata.md).

`ffprobe` (FFmpeg) must be installed. A library root must be `MEDIA_ROOT` or a folder under
it (default `./media`), and the server listens on `127.0.0.1` unless `HOST` says otherwise
(`0.0.0.0` only behind the reverse proxy, with `TRUST_PROXY` set to the proxy's fixed address; a CIDR only for a network holding
the proxy and the app alone). A scan never prunes rows while a sub-directory is
unreadable or the root is empty (unmounted volume). File names follow the Plex / Jellyfin conventions (`Title (2019).mkv`,
`Show/Season 01/Show S01E02.mkv`, optional `[tmdbid-…]` tags); the full list is in
[docs/architecture/specs/library-scan.md](docs/architecture/specs/library-scan.md).
Database migrations live in `apps/server/drizzle` (`pnpm --filter @popcorntv/server exec
drizzle-kit generate` after a schema change) and are applied at server start.

### Local staging

QA runs against the production image on this machine before any Pi deploy. `make
staging-up` builds the image of the current commit (`popcorntv:staging-<sha>`) and runs
[deploy/staging/compose.yml](deploy/staging/compose.yml), a copy of the Pi service
(`web-sync`, read-only root, dropped capabilities, separate cache volume) behind Caddy on
<http://localhost:8080> (`/api/*` is the server). Copy `.env.staging.example` to
`.env.staging` first; media come from `./media` (or `STAGING_MEDIA=/path`). The setup link
is in `make staging-logs`. `make staging-down` stops it and keeps the data; `make
staging-reset` deletes the data too.

## Documentation

- [docs/requirements](docs/requirements) — vision, actors, functional and non-functional requirements
- [docs/architecture](docs/architecture) — overview, UML diagrams, ADRs
- [PROJECT_LOG.md](PROJECT_LOG.md) — operational logbook
- [CHANGELOG.md](CHANGELOG.md) — released versions
- [SECURITY.md](SECURITY.md) — what is scanned, how to report

## License

[MIT](LICENSE)
