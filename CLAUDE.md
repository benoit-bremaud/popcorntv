# CLAUDE.md — PopCornTV

Project context for any AI agent session. Inherits the machine-global rules in
`~/.claude/CLAUDE.md` and `~/.agent-rules/common.md`; this file only adds what is specific
to PopCornTV.

## What this project is

A self-hosted media server + web player built from scratch, taking the best of Jellyfin
(free, self-hosted), Plex (automatic metadata) and Netflix (browsing and playback UX). It
serves the owner's own media files only — no content source is ever integrated.

## Working method

Conception precedes code (owner rule, conception gate in `common.md`):

1. Requirements — `docs/requirements/`
2. UML 2.5 in Mermaid (skill `uml-diagram-new`) — `docs/architecture/diagrams/<feature>/`
3. Decisions — MADR ADRs with an MCDA matrix — `docs/architecture/decisions/`
4. Implementation, one issue per brick, tests mandatory

## Stack (ADR-0001)

All-TypeScript pnpm monorepo. `apps/server` (Fastify 5, Drizzle + better-sqlite3, pino,
zod), `apps/web` (React 19 + Vite, hls.js), `packages/shared` (contracts). FFmpeg is an
external process driven by the server (HLS transcode when the browser cannot direct-play).
Metadata from TMDB. Node ≥ 22.

Hard rules: TypeScript strict, no `any`, named exports only, design tokens for colors /
spacing / typography, tests with every feature (Vitest unit, Playwright e2e later).

## Conventions

- Chat in French; code, comments, commits, PR bodies, docs in English.
- Conventional Commits; dedicated branch off `main` per issue; PR closes the issue.
- Every chat is named `#N Issue title` and works on that single issue.
- Log every merged PR and decision in `PROJECT_LOG.md` (skill `project-log-discipline`).
- Containers follow skill `docker-hardening` (non-root, HEALTHCHECK, pinned bases, Hadolint,
  Trivy).

## Git / GitHub

- Local git email `bbd.concept@gmail.com` (personal); GitHub account `benoit-bremaud`.
- Repo **public** until the first production deployment, then private (owner rule
  2026-10-15; Public Release Checklist in the global `CLAUDE.md`).
- Default labels only until a label triptych is adopted in a dedicated PR.

## Useful commands

- `pnpm install` — install the workspace (`better-sqlite3` and `esbuild` builds allowed).
- `pnpm dev:server` — Fastify API on <http://localhost:3000> (`GET /health`). Builds
  `packages/shared` first: its `exports` point types at `src/` and the runtime at `dist/`
  (Node refuses to strip types under `node_modules`, which is where the Docker image puts
  it). Re-run after editing the shared contracts; tests alias `src/` and need no build.
- `pnpm dev:web` — Vite dev server on <http://localhost:5173> (`/api` proxied to `API_URL`, default
  `http://localhost:3000`; e.g. `API_URL=http://localhost:3001 pnpm dev:web`).
- `pnpm typecheck` · `pnpm lint` · `pnpm format:check` · `pnpm test` · `pnpm coverage` ·
  `pnpm build`.
- `make staging-up` — production image of HEAD on <http://localhost:8080>, like the Pi
  (`deploy/staging/compose.yml`, env `.env.staging`); QA passes run here, never on the Pi.
  `make staging-logs` · `make staging-down` (keeps data) · `make staging-reset`.
- `make lint-docker` · `make scan-docker-config` · `make scan-docker-image IMAGE=…`.

## Current state

MVP bricks, one issue each. Done: bootstrap (repo, tooling, CI, Docker, vision, UML,
ADR-0001); #3 library scan (spec `docs/architecture/specs/library-scan.md`, ADR-0002 own
name parser, Drizzle schema `libraries` / `media` / `streams`, routes `POST|GET
/libraries`, `POST /libraries/:id/scan`, `GET /libraries/:id/media`; library roots are
confined under `MEDIA_ROOT`, `HOST` defaults to loopback); #4 TMDB metadata (spec
`docs/architecture/specs/tmdb-metadata.md`, ADR-0003: plain `fetch` client, id-first
matching, metadata columns + JSON `genres` / `cast` on `media`, documentary derived from
genre 99, artwork cached by digest under `ARTWORK_DIR`, scan chains the enrichment,
`POST /libraries/:id/enrich`, `GET /artwork/:file`); #5 catalog grid (ADR-0004); #7 direct
play (spec `docs/architecture/specs/direct-play.md`, ADR-0005: pure `decidePlayback` in
`packages/shared` fed by `canPlayType`, `GET /media/:id/file` with single-range 206 and the
path guard re-run per request, Play + native `<video>` player in `DetailDialog`); #8 HLS
transcode (spec `docs/architecture/specs/hls-transcode.md`, ADR-0006: every Play posts
`/playback/sessions`, the server confirms direct play with `directPlayMime` or runs FFmpeg
into an in-memory session — H.264/AAC copied, the rest re-encoded, MPEG-TS EVENT playlist,
60 s idle watchdog + 20 s web heartbeat, hls.js loaded on demand; #74
ADR-0012: at the limit a Play takes over the caller's own oldest session, else for an owner
the oldest viewer one); #9 resume (spec
`docs/architecture/specs/resume-playback.md`, ADR-0007: `watch_progress` keyed by
`profile_id` `'default'` until #10, `PUT /media/:id/progress` (now under `/profiles/:profileId/`, #10) every 10 s / on pause / on
close, `GET /progress`, `startSec` → FFmpeg `-ss` + `offsetSec` in the answer, Next episode
button); #10 profiles (spec `docs/architecture/specs/profiles.md`, ADR-0008: `profiles`
table seeded with `default` / `Me`, `watch_progress.profile_id` FK cascade, progress
routes under `/profiles/:profileId/`, "Who's watching?" remembered in `localStorage`,
profile management per user since #18, last profile undeletable); #24 subtitles
(spec `docs/architecture/specs/subtitles.md`, ADR-0009: embedded text tracks only, pure
`subtitleTracks` in `packages/shared`, `GET /media/:id/subtitles/:index?offsetSec=` extracts
with FFmpeg on demand, caches the unshifted WebVTT under `TRANSCODE_DIR/subtitles` and shifts
the cues for a resumed HLS timeline, one `<track>` per offered track); #18 lot 1 accounts
(spec `docs/architecture/specs/auth.md`, ADR-0010: `users` / `sessions` / `auth_tokens` /
`auth_events`, `profiles.user_id`, opaque session token stored as SHA-256 in
`pctv_session` / `__Host-pctv_session`, `PUBLIC_URL` required, CSRF by `Origin` /
`Sec-Fetch-Site`, one-time setup link in the log, routes declare `config.access`
`public` | `owner`, profiles and playback sessions per user; invitations, resets, account
administration and the event list are lot 2); #73 lot 2 (`token-repository` single-use
invite / reset links redeemed by `POST /auth/redeem`, owner `user-routes` for accounts,
devices, links and `GET /auth/events`, last owner protected, web `RedeemForm` +
`AdminPanel` from the account menu); #72 global rate limit (ADR-0011, spec auth R13:
`@fastify/rate-limit` as the first root `onRequest` hook keyed on `clientKey`, 300 / min per
client, `MEDIA_ROUTE` routes in a 3000 / min bucket, `buildApp` is async); #123 library management
(spec `docs/architecture/specs/library-management.md`, ADR-0014: owner `GET
/libraries/folders` lists the direct sub-folders of `MEDIA_ROOT`, `PATCH|DELETE
/libraries/:id`, overlapping roots refused `409 root_in_use`, delete under the library lock,
synchronous scan, web `LibrarySection` in `AdminPanel` + "Add a library" on the empty
catalog; an empty JSON body is accepted on every route, #122); #131 continue-watching row
(ADR-0015); #132 scheduled scan (spec `docs/architecture/specs/scheduled-scan.md`,
ADR-0016: `SCAN_INTERVAL_MIN`, default 60, `0` off, an in-process unref-ed timer runs the
route's `scanLibrary` on every library in turn, a busy one skipped, no overlap, stopped and
awaited in `preClose`); #133 watched marks (spec `docs/architecture/specs/watched-marks.md`,
ADR-0017: nullable `watch_progress.watched_at`, `finished` = mark or ≥ 90 %, `PUT|DELETE
/profiles/:profileId/media/:id/watched`, a series applies to its episodes, unwatched forgets
the row, poster ✓ via `WatchedContext`); #134 progress carry-over (spec
`docs/architecture/specs/progress-carry-over.md`, ADR-0018: before missing rows are pruned,
their `watch_progress` moves to the one present file of the same title, pure `identity`);
#135 search (spec `docs/architecture/specs/search.md`: client-side `searchItems` over titles
and cast names, accent- and case-folded, title matches first, the results grid replaces the
rows); #136 audio track (spec `docs/architecture/specs/audio-track.md`, ADR-0019: pure
`audioTracks` / `effectiveAudioIndex` / `matchAudioTrack` in `packages/shared`, `audioIndex`
0–99 on `POST /playback/sessions`, a non-default track forces HLS with `-map 0:a:N`, Audio
select in `DetailDialog` matched by language on each played episode); #127 Discover + wishlist (spec
`docs/architecture/specs/discover-wishlist.md`, ADR-0020: `src/discover/` routes over the
TMDB client — `GET /discover?list=trending|popular&kind=movie|tv` memoised 15 min,
`/discover/search`, `/discover/:kind/:tmdbId`, lazy `w342` posters through the artwork cache
at `/discover/poster/:file` for handed-out paths only — per-profile `wishlist` table (FK cascade), `PUT|DELETE
/profiles/:profileId/wishlist/:kind/:tmdbId` (`PUT` reads the facts from TMDB), "Available" is a join
on `media.tmdb_id`, web Library / Discover tabs, "Play in my library" opens the library
dialog; no Seerr request, #128); #182 logging (spec `docs/architecture/specs/logging.md`,
ADR-0021: `LOG_LEVEL` validated, pino redact, one `http.request` line per answer through
the `OneLinePerRequest` log controller, `event: "<domain>.<action>"` on every domain line,
`auth_events` mirrored into the log by `EventRepository.record` without `usernameTried`,
`scripts/log-coverage.mjs` in `pnpm lint` refuses a silent `catch`).

Server layout (flat, component diagram 03): `src/library/` holds the pure `name-parser`
and `path-guard`, the `ffprobe` runner (only process egress), the `folder-lister` (one-level `readdir` of `MEDIA_ROOT`), the `scanner`, the pure `identity` (carry-over keys, ADR-0018), the `scheduler` (interval rescans, ADR-0016), the per-library
`lock` (scan + included enrich and explicit enrich never overlap), the Drizzle `repository`
and the `routes`; `src/playback/` the pure `range` parser, the
streaming `routes`, the pure `ffmpeg-args`, the `transcoder` (only child-process egress,
`spawn` injected), the `session-manager` and the `session-routes`; `src/progress/` the `watch_progress`
`repository` and its `routes`; `src/profiles/` the `profiles` `repository` and its `routes`; `src/discover/` the `wishlist-repository`
(and the local `tmdb_id` match) and the Discover `routes` (ADR-0020); `src/metadata/` the `tmdb-client` (only HTTP egress,
`fetch` injected), the pure `matcher` (match + map), the `artwork-cache`, its
`repository`, the `service` and the `routes`; `src/auth/` the `hasher` (only argon2 import), the `token` helpers, the `setup-token`, the
in-memory `limiter`, the `user` / `session` / `token` / `event` repositories, the access `hook`, the
`routes` (public and self-service) and the owner `user-routes`;
`src/http.ts` the route helpers and the `Caller` type; `src/logging.ts` the logger options
(`LOG_LEVELS`, `REDACT_PATHS`, `loggerOptions`), `requestLevel`, the `OneLinePerRequest`
log controller and `registerRequestLog`; `src/db/`
the schema and `openDatabase` (migrations in `apps/server/drizzle`, generated by
drizzle-kit — build `packages/shared` first — applied at start).
