# QA coverage ledger — PopCornTV

One row per screen or flow. Cell format: `date · SHA · environment · OK | KO #N | — (reason)`. Source: [full pass of 2026-11-08](../architecture/qa/2026-11-08-full-pass-pi.md). Responsive cells: only 619 px and 1728 px were reachable. Offline cells: no probe possible with the tool in use. A row is complete when every cell carries a date or a reason.

| Flow | Nominal | Error | Offline | Back | Accessibility | Responsive |
|---|---|---|---|---|---|---|
| Sign-in / setup | — (owner session in use, no sign-out) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (A11Y-08 not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Redeem link | — (no link redeemed (would consume or create one)) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Profile picker + management | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (XSS, empty, RTL, whitespace probes; alert shown) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK (reload keeps profile) | 2026-11-09 · 15b9179 · unit (jsdom) + e2e · OK (A11Y-02 false positive, [report](../architecture/qa/2026-11-09-issue-173-profile-picker-name.md)), pending Full QA | — (window floor 619 px, 320/390 not reachable) |
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

## Account menu checks (#164)

Replay on every pass that touches the header:

1. Open the account menu, press Escape: it closes and focus is on the name button
   (a visible focus ring with the keyboard).
2. Open it, click empty catalog space (mouse) or tap it (phone): it closes. A click on a
   poster both closes the menu and opens the title (the click is not swallowed).
3. Open it, click "Change password", type in the fields: the menu stays open.
4. Owner: open it, click Administration: the menu closes and the administration shows.
5. Open the menu, Tab to a poster, Enter: Escape closes the detail, not the menu; a
   second Escape closes the menu and focus stays on the poster.
6. Open the menu, Tab to the search box, type, Escape: the query clears, the menu closes,
   focus stays in the search box.
7. Sign out with the server stopped: the menu stays open and shows the error.

## Search announcement checks (#165)

Replay with a screen reader (Orca on Firefox, then NVDA or VoiceOver when available):

1. Library tab, type "heat" quickly: one announcement "1 result for “heat”" after the
   pause, not one per letter.
2. Type a query that matches nothing: "No match for “…”" is read; the visible line says
   "No title or person matches “…”".
3. Clear the field (Escape or select-all + Delete): no stale count is read afterwards.
4. Type only spaces: nothing is announced and the rows stay.
5. Discover tab, search and press Enter: "Searching for “…”…" then the count; with the
   network cut, "TMDB could not be reached." is read.
6. Empty catalog: once it has loaded, the viewer hears "Nothing to watch yet." and the
   owner hears the welcome line (same region, its text changes).
7. DOM check: exactly one `role="status"` region per tab, present before the first search
   and before the catalog loads.

## Discover live search checks (#166)

1. Discover tab, type "dune" and wait: results appear about 0.4 s after the last
   keystroke, without Enter; the network panel shows one `/discover/search?q=dune`.
2. Type "dune" quickly letter by letter: a single request goes out, not one per letter.
3. Type "dune" and press Enter at once: results appear immediately and no second
   request follows after the pause.
4. Add trailing spaces to a successfully searched query: no new request.
5. Type only spaces: no request, the rows stay, nothing is announced.
6. Escape in the field: the field, the results and the announcement clear; the rows show.
7. Throttle the network, type "da", pause, then "dark": the "da" answer arriving late
   never replaces the "dark" results.
8. Cut the network, search "dune" (failure read), restore it, press Enter: the search is
   retried. With Japanese input, no request goes out before the candidate is confirmed.
9. Screen reader: each pause reads "Searching for …" then the count, once per pause.
10. Empty and failure states are unchanged: "No title matches." and "TMDB could not be
   reached." (network cut).

## Placeholder contrast checks (#167)

1. Catalog search, Discover search, profile name, library Path ("Other folder…") and
   library Name fields: each placeholder reads `rgb(163, 154, 148)` (`--color-text-muted`) in DevTools.
2. Measured contrast: ≥ 5.9:1 on `.input` (`--color-surface-raised`), ≥ 6.5:1 on the
   catalog and Discover searches (`--color-surface`); the user-agent grey was 3.6:1 and 3.9:1.
3. Firefox: the placeholder is not dimmed further (`opacity: 1`).
4. Typed text stays `--color-text`; the placeholder never looks like a filled value.

## Identity autofill checks (#168)

1. With a password manager or identity extension active, focus the catalog search, the
   Discover search, "Add a profile" (and a profile edit name), library Name, library Path
   ("Other folder…"), the Rename field and the delete confirmation: no contact or identity
   suggestion opens.
2. Submit a new profile and a new library: no "Save contact info" prompt follows.
3. DevTools: each of those inputs carries `autocomplete="off"` and its `name` (`q`,
   `profile-name`, `library-name`, `library-path`, `library-rename`, `library-confirm`).
4. Sign-in still offers the saved username and password (`username` /
   `current-password`); setup, invitation, reset and password change still offer to
   generate and save a password (`new-password`); the setup token stays `off`.

## Title dialog action checks (#172)

1. Library dialog, film never played: "▶ Play" and "Mark as watched" sit in one row, same
   pill shape, both 44 px high (DevTools box model), one `--space-2` gap, aligned edges.
2. Film with a saved position: "▶ Resume from …", "Start over" and the watched toggle in
   that same row; the row wraps cleanly at 390 px.
3. Series: the row holds the watched toggle alone; the genre tags start one `--space-4`
   below the row (no 8 px crowding).
4. Discover sheet: "Play in my library" and "+ My list" match the library dialog row.
5. Both dialogs label the cast "Cast:" (muted) followed by the names; no "With …" line;
   no cast line when TMDB gives none.
6. The ✕ close button measures 44×44 px in both dialogs and in the player, keyboard focus
   ring visible.
7. A long title ("Harry Potter and the Philosopher's Stone") in the Discover sheet and in a
   library dialog without backdrop never runs under the close button.

## Profile picker accessible name checks (#173)

1. "Who's watching?": in DevTools › Accessibility (or the axe / Playwright
   `getByRole('button', { name })` tree), each profile button's computed name is the
   profile name alone ("Me"), never "MMe". Read the accessibility tree, not `textContent`
   or `innerText`: those include the `aria-hidden` avatar initial and give a false "MMe".
2. A profile named in RTL script with an emoji (e.g. "مريم 🎬") is announced intact, with
   no initial before it.
3. The avatar span carries `aria-hidden="true"`; the header profile switcher is named
   "Me, switch profile" with no initial before it (Chromium shows "Me , switch profile":
   the flex items add a space).

## Device label checks (#174)

1. Administration › Accounts › Devices: each device reads "<Browser> on <System>" (e.g.
   "Chrome on Linux", "Safari on iOS"), never the raw `Mozilla/5.0 …` string; hovering it
   shows the full raw User-Agent.
2. Sign in from Edge or Opera: the label says "Edge" / "Opera", not "Chrome".
3. An iPad reports "Macintosh" by default (desktop mode since iPadOS 13): "Safari on
   macOS" is expected; in mobile mode it reads "Safari on iPadOS". A Samsung TV reads
   "Device on Tizen".
4. A session opened by a non-browser client shows its raw User-Agent (e.g. `curl/8.x`); a
   session with no User-Agent header shows "Unknown device".

## Administration panel polish checks (#175)

1. Administration: every date (last sign-in, invitation expiry, shown link validity,
   device last seen, sign-in activity) reads ISO 8601 in the browser's time zone with
   its offset (e.g. "2026-11-09 00:34 +01:00", "Z" for UTC), 24 h clock, never "11/8/2026, 12:34:05 AM",
   whatever the browser language.
2. An account with one live session reads "1 device", none "0 devices", two "2 devices".
3. Add a library on a 1440 px window: the Folder, Path, Name and Kind labels sit on one
   line, the boxes have the same height, and "Add" follows the Kind box; "Create an
   invitation link" sits right after its Role select, not at the far right.
4. Revoke reset link is disabled (tooltip "No pending reset link") for an account without
   a pending link; issuing a reset link enables it; revoking shows "Reset link of <name>
   revoked." and disables it again; a role change also disables it.
5. Two owner tabs: revoke in one, then in the other (stale list) → "No pending reset link
   for <name> any more: the list was refreshed." and the button turns disabled.
