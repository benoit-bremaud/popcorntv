# QA pass — security headers and no inline style (#31) (2026-11-02)

| Level | Head SHA | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass | 00ac7e6 | local: API http://localhost:3001, web http://localhost:5173 (Vite, `/api` proxied) | W, A | qa-tester · Sonnet 5.5 (product and SEC parts in one run) | not published (orchestrator only) |

Allowed hosts: `localhost`, `127.0.0.1`. No third-party host probed. Scratch `MEDIA_ROOT`, DB and artwork folder under the session scratchpad; no TMDB key.

Setup notes (environment, not product findings):
- Port 3000 was held by an unrelated Express service on this machine, so the API ran on 3001. The Vite proxy targets 3000 (hard-coded in `apps/web/vite.config.ts`), so a temporary `apps/web/vite.qa.config.ts` (proxy to 3001) was used, then deleted. `.claude/launch.json` was created and deleted. No product file was edited.
- Without a TMDB key the catalog only has a "Films" row. Metadata (genres, ratings, a cached poster) was written directly into the scratch SQLite DB to obtain 9 to 10 rows. Seven 3 s H.264/AAC MP4 files (direct play) and one MPEG-4/MP3 MKV (forces HLS) were generated with ffmpeg.

## Plan

Diff (6 files): `app.ts` (+`onSend` hook, 3 headers), `PosterRow.tsx` / `CatalogBody.tsx` (inline `style` removed), `catalog.css` (`.view > .row:nth-child(n)` stagger), 2 tests. Domains in: FON (diff paths), DAT-01 (headers on responses), UI-01/02/04/07 (responsive, console, motion), SEC-01…10, plus playback regression because CORP touches media loads. Out: A11Y, PERF, ROB, MOB, USA, PRI beyond what the above observed (the diff changes no semantics, forms or timing; P0 items there are N/A for this diff).

## QA matrix

Gate ✅ · 🔴 Must 0 · 🟡 Should 1 · 🔵 Nice 2 — 20 checks: Pass 16 · Fail 1 · Mixed 0 · Not tested/N/A 3

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey: pick profile, catalog, detail, Play | Pass | PASS | catalog 10 rows, detail opens, Play works | | 01, 02 |
| FON-02a | FON | Direct play (206 range) with new headers | Pass | PASS | `POST /playback/sessions` 200, `/media/:id/file` 206, video reached `currentTime 3 / duration 3`, no `error` | | 03 |
| FON-02b | FON | HLS transcode (hls.js, blob source, `.m3u8` + `.ts`) with new headers | Pass | PASS | session 201, `index.m3u8` 200, `segment-00000.ts` 200, ended at 4.2 s / 4.2 s, no console error | | 04 |
| FON-02c | FON | Artwork loads through the proxy | Pass | PASS | `/api/artwork/<digest>.png` 200 `image/png`, 17 of 17 above-the-fold images decoded, 5 below-the-fold are `loading=lazy` (not broken) | | 01 |
| FON-02d | FON | Views: All, Films, By genre keep rows as the only children of `.view` | Pass | PASS | `.view` children are all `section.row` in the three views, delays correct in each | | |
| DAT-01 | DAT | Headers on every response class | Pass | PASS | `curl` direct on :3001 and via the :5173 proxy: 200 (`/health`, JSON, artwork file, media 206), 201, 400 (zod, broken JSON), 404 (route, `/artwork/<valid-64-hex>.jpg` missing), 413 (6 MB body) all carry `x-content-type-options: nosniff`, `referrer-policy: no-referrer`, `cross-origin-resource-policy: same-origin`. 20 browser responses read: all three present | | |
| UI-STAG-1 | UI | No `[style]` attribute on rows (or anywhere) | Pass | PASS | `document.querySelectorAll('[style]').length === 0` at 1440, 390; Chromium and Firefox; also on the dialog/detail screen not opened, see note | | 01, 07 |
| UI-STAG-2 | UI | Computed `animation-delay` 0, 60, 120 ms… capped at 360 ms | Pass | PASS | 9 rows: `0s 0.06 0.12 0.18 0.24 0.3 0.36 0.36 0.36`; 10 rows at 390 px: same cap. Firefox 1440: identical | | 05, 07 |
| UI-04 | UI | `prefers-reduced-motion: reduce` | Pass | PASS | emulated: all 9 delays `0s` (`--stagger: 0ms`); animation `rise` kept with duration 0.5 s and `--travel: 0px`, matching the documented "gentler, not zero" token rule | | |
| UI-01 | UI | Viewports 390, 768, 1440 | Pass | PASS | `scrollWidth == clientWidth` at 390 (375) and 768 (753); layout intact | | 01, 05, 06 |
| UI-03 | UI | Engines | Pass | PASS | Chromium and Firefox (WebKit not run, no layout primitive changed beyond `:nth-child`, universally supported) | | 07 |
| UI-02 | UI | Console and network after the journey | Pass | PASS | console: 0 errors, 0 warnings from product (only Vite connect and React DevTools info); no failed request. One error appeared only from my deliberate cross-origin CORP probe. Dev-only noise: every `GET` to `/profiles`, `/libraries`, `/libraries/:id/media` fires twice (React StrictMode double effect), not filed | | |
| SEC-01 | SEC | Security headers | Pass | PASS | API: the 3 headers on every response; no `Server`, no `X-Powered-By`, no `X-XSS-Protection`. CSP, `frame-ancestors`, `Permissions-Policy`, HSTS absent: by design (issue #31: they belong to whatever serves the web build, not yet in the Docker image); the Vite dev server sends none either. See Nice 1 | | |
| SEC-02 | SEC | Cookies | N/A | N/A | no `Set-Cookie` on any route; only `localStorage` key `popcorntv.activeProfileId` (profile id, not a secret) | | |
| SEC-03 | SEC | Origin / CORS | Pass | PASS | `Origin: https://evil.test` and `Origin: null` on `/profiles`: no `Access-Control-Allow-*`; preflight `OPTIONS` 404; WebSocket upgrade with foreign Origin: 404, no 101. Browser confirms CORP effective: same-origin proxy image loads, direct cross-origin `:3001` image is blocked (intended) | | |
| SEC-04 | SEC | XSS | Pass | PASS | profile name `<img src=x onerror=alert(1)>` rendered as text in the picker, 0 `img[src=x]`, 0 dialogs. Transient profile deleted afterwards | | 08 |
| SEC-05 | SEC | Authn / authz | N/A | N/A | no authentication until #18 by design (spec profiles; `HOST` defaults to loopback) | | |
| SEC-06 | SEC | Input limits | Pass | PASS | 200 KB name 400, 6 MB body 413, wrong type 400, empty 400, broken JSON 400; unknown field accepted but ignored (not echoed, no effect); `/health` 200 after | | |
| SEC-07 | SEC | Rate limits | N/A | N/A | no limiter specified or present; 20-call burst at 120 ms all 200. Recorded, not a requirement of the study | | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 404, zod 400 (path traversal in `:id` and `:file`), 400 on `rootPath` outside `MEDIA_ROOT`, 413: no stack, path, SQL or version | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `pnpm --filter @popcorntv/web build`: no `.map`, no `sourceMappingURL`, no key/token pattern, no internal URL; the only absolute URLs are library namespaces (w3.org, react.dev, aomedia.org) | | |
| SEC-10 | SEC | Third parties | Pass | PASS | every request in the network list is `localhost:5173` (fonts are bundled woff2); no third-party host | | |
| SEC-17 | SEC | Info leaks | Pass | PASS | `/.git/config`, `/.env`, `/docs`, `/swagger`, `/openapi.json`, `/debug`, TRACE: all 404 | | |
| SEC-18 | SEC | Dependencies | Mixed | FAIL | `pnpm audit --prod`: 2 moderate (`minimatch` < 11.0.1, `glob` 9.0.0 to 14.0.1, via `@fastify/static`), not touched by this diff | proposed | |
| SEC-11/12/13…16/19…21 | SEC | Not selected at level `pass` | Not tested/N/A | NOT TESTED | outside the `pass` list (full only) | | |
| MOB-* | MOB | Native mobile | Not tested/N/A | N/A | web product | | |

(Counts above rounded to the rows that carry a verdict of their own; the "20 checks" line groups sub-rows.)

## Findings to act on

No Must. The change does what #31 asks and breaks nothing observed.

1. 🟡 Should — Two moderate dependency advisories in the API's production tree (SEC-18): `glob` AbortSignal bypass and `minimatch` DoS, reached through `@fastify/static`. Pre-existing and outside the diff. Proposed issue: `chore(deps): update @fastify/static to pull patched glob and minimatch`. Not filed (owner asked for a list first).
2. 🔵 Nice — No CSP, `frame-ancestors`, `Permissions-Policy` or HSTS anywhere yet (SEC-01), because nothing serves the built web app. The new "no inline style" rule is only a precondition. Proposed issue: `feat(security): serve the web build with a strict CSP` (`default-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`; hls.js uses `blob:` for `media-src`) together with the production reverse-proxy / Docker decision; it must keep the web build and `/api` on one origin because of CORP.
3. 🔵 Nice — `apps/web/vite.config.ts` hard-codes the API proxy target `http://localhost:3000` while `PORT` is configurable. Not hit by users unless 3000 is taken (it was here). Proposed issue: `chore(web): read the dev proxy target from an env var`. Suggested diff (not applied): `target: process.env['API_URL'] ?? 'http://localhost:3000'`.

Observation, no action: CORP `same-origin` blocks any cross-origin consumer of the API (verified: an image fetched from `:3001` on a `:5173` page is blocked). The code comment documents this and the web app uses `/api`, so it holds; deploying the web build on a different origin than the API will break `<video>`, `<img>` and hls.js loads.

## Not tested

- SEC-11, 12, 13, 14, 15, 16, 19 and the full-level items: `pass` level. SEC-12/14/16 do not apply (no sessions, uploads or tokens).
- A11Y, PERF, ROB, USA, PRI domains: the diff changes none of their subjects; no failure seen incidentally (Esc closes the player layer, then the dialog, as designed).
- WebKit engine (not installed/validated here).
- No `[style]` check inside the open detail dialog or the player was done separately from the row check: the DOM-wide `[style]` count was 0 on the catalog only; the dialog was open in screenshot 02 but not counted. Low risk, the diff does not touch it.

## Delta vs previous report

Previous: `docs/architecture/qa/2026-10-24-profiles.md`. This pass did not re-run its checks; no regression seen on the profiles picker (profile list, switch, remembered profile all worked).

## Screenshots

`2026-11-02-security-headers/`: 01-catalog-1440, 02-detail, 03-direct-playback, 04-hls-playback, 05-catalog-390, 06-catalog-768, 07-firefox-1440, 08-xss-profile-name.
