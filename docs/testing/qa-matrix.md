# QA coverage ledger — PopCornTV

One row per screen or flow. Cell format: `date · SHA · environment · OK | KO #N | — (reason)`. Source: [full pass of 2026-11-08](../architecture/qa/2026-11-08-full-pass-pi.md). Responsive cells: only 619 px and 1728 px were reachable. Offline cells: no probe possible with the tool in use. A row is complete when every cell carries a date or a reason.

| Flow | Nominal | Error | Offline | Back | Accessibility | Responsive |
|---|---|---|---|---|---|---|
| Sign-in / setup | — (owner session in use, no sign-out) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (A11Y-08 not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Redeem link | — (no link redeemed (would consume or create one)) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Profile picker + management | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (XSS, empty, RTL, whitespace probes; alert shown) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK (reload keeps profile) | 2026-11-08 · 0698684 · Pi · KO #173 | — (window floor 619 px, 320/390 not reachable) |
| Library catalog + rows | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | 2026-11-08 · 0698684 · Pi · OK (empty/missing artwork states) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #170 · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | 2026-11-08 · 0698684 · Pi · OK (619 px) · [shot](../architecture/qa/2026-11-08-full-pass-pi/17-narrow-619-home.jpg) |
| Search | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/07-library-search-results.jpg) | 2026-11-08 · 0698684 · Pi · OK (%, tags, 500 chars, whitespace) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #165 | 2026-11-08 · 0698684 · Pi · OK (619 px) |
| Detail dialog | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · f5ef04f · e2e · OK (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | 2026-11-08 · 0698684 · Pi · KO #172 | 2026-11-08 · 0698684 · Pi · OK (619 px) · [shot](../architecture/qa/2026-11-08-full-pass-pi/18-narrow-619-dialog.jpg) |
| Direct play | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/20-direct-play-sprite-fright.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (player controls native, not audited) | — (window floor 619 px, 320/390 not reachable) |
| HLS play | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/06-hls-player-sintel.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (player controls native, not audited) | — (window floor 619 px, 320/390 not reachable) |
| Resume | 2026-11-08 · a0aedb0 · local prod build · OK (#55 fixed: copied resume reports the real start) · [report](../architecture/qa/2026-11-08-issue-55-resume-offset.md) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Next episode | — (no series with episodes in the libraries) | — (no series) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no series) | — (no series) | — (window floor 619 px, 320/390 not reachable) |
| Subtitles | — (no file with a text track reached) | 2026-11-08 · 0698684 · Pi · OK (index 999 / -1 / 0 probes: 404/400/200) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no track) | — (no track) | — (window floor 619 px, 320/390 not reachable) |
| Audio track | 2026-11-08 · 0698684 · Pi · KO #157 | — (no multi-audio file) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no multi-audio file) | — (no multi-audio file) | — (window floor 619 px, 320/390 not reachable) |
| Watched marks | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (double click, delete twice) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Continue watching | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #170 · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | — (window floor 619 px, 320/390 not reachable) |
| Discover rows | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (bad list/kind, ids probes: 400/404) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Discover search | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (XSS, SQL-ish, empty, 300 chars) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #166 | — (window floor 619 px, 320/390 not reachable) |
| Discover with TMDB unreachable (#179) | — (error-only flow) | 2026-11-08 · local prod build · OK (502 on rows, search, sheet, add) · [report](../architecture/qa/2026-11-08-issue-179-tmdb-unavailable.md) | 2026-11-08 · local prod build · OK (proxy to a closed port) | — (no navigation in this flow) | — (no UI change) | — (no UI change) |
| Title sheet | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (movie/abc, -1, 99999999) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| My list | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (random profile 404, book kind 400) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Play in my library | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Admin: accounts | 2026-11-08 · 0698684 · Pi · OK | — (no destructive action by rule) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #175 | — (window floor 619 px, 320/390 not reachable) |
| Admin: devices | 2026-11-08 · 0698684 · Pi · OK | — (no revoke by rule) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #174 | — (window floor 619 px, 320/390 not reachable) |
| Admin: links | 2026-11-08 · 0698684 · Pi · OK | — (no link created or revoked by this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #175 | — (window floor 619 px, 320/390 not reachable) |
| Admin: events | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #175 | — (window floor 619 px, 320/390 not reachable) |
| Libraries add / edit / delete / scan | 2026-11-08 · 0698684 · Pi · KO #163 | 2026-11-08 · f69a401 · inject tests · OK, staging owner replay pending (#163, [report](../architecture/qa/2026-11-08-issue-163-library-root.md)) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Unknown paths (#177) | 2026-11-08 · local staging · OK (`/`, assets 200) · [report](../architecture/qa/2026-11-08-issue-177-not-found.md) | 2026-11-08 · local staging · OK (24-path matrix, 404 page, `/api` JSON) | — (static page, no network call) | — (no layer) | — (not audited) | — (not audited) |
| Scheduled scan | — (timer needs server logs, ROB-07) | — (needs server logs) | — (BLOCKED) | — (no UI) | — (no UI) | — (no UI) |

## Library root checks (#163)

Replay on every pass that touches library creation or the path guard (owner, `POST /api/libraries`):

1. A missing folder under `MEDIA_ROOT` (`/app/media/nonexistent-qa`) answers `409
   root_unreadable` and `GET /api/libraries` lists nothing new; the admin form shows "The
   server cannot read this folder."
2. A file instead of a folder, a link under `MEDIA_ROOT` pointing outside it, and a dangling
   link answer the same `409 root_unreadable`.
3. NUL (`\u0000`), newline, tab, DEL and a C1 control in `rootPath` answer `400
   invalid_request`; the same characters inside `name` answer 400 on create and on rename
   (`PATCH`), and the old name stays.
4. A trailing slash is stored without it; surrounding whitespace in the name is trimmed (a
   final newline too, so it is accepted).
5. Accented folder names (NFC and NFD) that exist are accepted as written.
6. Unchanged: `/etc`, `../etc`, `/app/media/../../etc` answer 400, an existing root `409
   root_in_use`, a link to another library's root `409 root_in_use`.

## Not-found checks (#177)

Replay on every pass that touches a Caddyfile, the web build entries or the deploy:

1. `make staging-up` then `make check-not-found`: every line is `ok` (unknown paths,
   dotfiles, trailing slash, deep paths, `HEAD`, query strings, `/index.html/x`, encoded
   dots answer `404 text/html`; `/`, `/index.html`, a hashed asset and the favicon `200`).
2. `/api`, `/api/artwork/..%2f..%2fetc%2fpasswd`, `/api/%2e%2e/nope` answer `404
   application/json`, never HTML; `/api/health` still `200`.
3. The 404 page renders with the token styles (no CSP violation in the console) and its
   link lands on the catalog.
4. A setup or redeem link (`/#…`) still opens its form: the hash flows only use `/`.
5. On the Pi, after an owner deploy that copies the homelab Caddyfile: same matrix with the
   Pi origin (`scripts/not-found-check.sh https://popcorntv.bb-homelab.local`).

## Discover TMDB failure checks (#179)

Replay on every pass that touches Discover, the title sheet or the wishlist:

1. Start the server with `TMDB_API_KEY` set and TMDB unreachable (`NODE_USE_ENV_PROXY=1
   HTTPS_PROXY=http://127.0.0.1:9`, a closed port): `GET /discover`, `/discover/search`,
   `/discover/movie/1` and `PUT …/wishlist/movie/1` answer `502 tmdb_unavailable`, never
   `500`; the log has one `discover.tmdb.failed` line per call, without the API key.
2. A `200` whose body is not JSON cannot be produced by hand (`API_BASE` is fixed to
   `https://api.themoviedb.org`, TLS pinned by the CA store): covered by the client and
   route tests only.
3. After TMDB comes back, the next call answers normally (no poisoned state).
4. The web Discover tab shows its muted line instead of a row, never a blank page.

## Resume checks (#55, ADR-0023)

Replay on every pass that touches playback, with an H.264 file copied to HLS (not
re-encoded) and one with a text subtitle track:

1. Resume at a position a few seconds after a keyframe: the picture, the subtitles and the
   position saved after 10 s agree with the media time (no forward drift on the next
   resume).
2. Resume exactly on a keyframe: same agreement (FFmpeg backs its seek off with B-frames).
3. Resume a file whose audio leads the video keyframe (e.g. an MKV remuxed from a TV
   recording): same agreement.
4. The server log shows `playback.session.opened` with `offsetSec` ≤ `startSec` and no
   `playback.keyframe.failed`.

## Continue watching checks (#140)

Replay on every pass that touches the catalog, the detail dialog or the player:

1. Play a film from the row for a minute, close the player then the detail dialog at once
   (Escape twice): the row shows the new position without another dialog close.
2. Same with the network throttled (DevTools "Slow 4G"): the row updates once the last
   `PUT …/progress` answers, never to the older position.
3. Open and close a detail dialog without playing: the row reloads at once.
4. Open and close two titles quickly in turn: the row keeps the latest answer.

## Back navigation checks (#169)

Replay on every pass that touches a dialog (spec history-back, ADR-0024):

1. Open a title, press Back (phone Back gesture): the dialog closes, the app stays.
2. Open a title, Play, Back: the player closes and the detail stays; Back again closes it.
3. Close a dialog by its button or Escape, then Back: nothing reopens and the app stays
   only if there was an entry before it (no dead Back press).
4. Double Back fast from the player: both layers close, the position is saved.
5. Open a title, reload: the catalog shows, no dialog; Back does not reopen one.
6. Discover → title sheet → Back closes the sheet; "Play in my library" → Back from the
   detail returns to the catalog in one press.
7. Close then reopen a title at once: the new dialog stays open.
