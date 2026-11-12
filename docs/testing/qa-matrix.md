# QA coverage ledger — PopCornTV

One row per screen or flow. Cell format: `date · SHA · environment · OK | KO #N | — (reason)`. Source: [full pass of 2026-11-08](../architecture/qa/2026-11-08-full-pass-pi.md), [pass of 2026-11-10](../architecture/qa/2026-11-10-full-pass-pi.md). Responsive cells: only 619 px and 1728 px were reachable. Offline cells: no probe possible with the tool in use. A row is complete when every cell carries a date or a reason.

| Flow | Nominal | Error | Offline | Back | Accessibility | Responsive |
|---|---|---|---|---|---|---|
| Sign-in / setup | — (owner session in use, no sign-out) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (A11Y-08 not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Redeem link | — (no link redeemed (would consume or create one)) | — (needs sign-out or a new account, forbidden by the rules of this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (not reachable) | — (not reachable) | — (window floor 619 px, 320/390 not reachable) |
| Profile picker + management | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (XSS, empty, RTL, whitespace probes; alert shown) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK (reload keeps profile) | 2026-11-09 · 15b9179 · unit (jsdom) + e2e · OK (A11Y-02 false positive, [report](../architecture/qa/2026-11-09-issue-173-profile-picker-name.md)); 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Library catalog + rows | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | 2026-11-08 · 0698684 · Pi · OK (empty/missing artwork states) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #170 · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | 2026-11-08 · 0698684 · Pi · OK (619 px) · [shot](../architecture/qa/2026-11-08-full-pass-pi/17-narrow-619-home.jpg) |
| Search | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/07-library-search-results.jpg) | 2026-11-08 · 0698684 · Pi · OK (%, tags, 500 chars, whitespace) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | 2026-11-08 · 0698684 · Pi · OK (619 px) |
| Detail dialog | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · f5ef04f · e2e · OK (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | 2026-11-08 · 0698684 · Pi · OK (619 px) · [shot](../architecture/qa/2026-11-08-full-pass-pi/18-narrow-619-dialog.jpg) |
| Direct play | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/20-direct-play-sprite-fright.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (player controls native, not audited) | — (window floor 619 px, 320/390 not reachable) |
| HLS play | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/06-hls-player-sintel.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (player controls native, not audited) | — (window floor 619 px, 320/390 not reachable) |
| Resume | 2026-11-08 · a0aedb0 · local prod build · OK (#55 fixed: copied resume reports the real start) · [report](../architecture/qa/2026-11-08-issue-55-resume-offset.md) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Next episode | — (no series with episodes in the libraries) | — (no series) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no series) | — (no series) | — (window floor 619 px, 320/390 not reachable) |
| Subtitles | — (no file with a text track reached) | 2026-11-08 · 0698684 · Pi · OK (index 999 / -1 / 0 probes: 404/400/200) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no track) | — (no track) | — (window floor 619 px, 320/390 not reachable) |
| Audio track | 2026-11-08 · 0698684 · Pi · KO #157 | — (no multi-audio file) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | — (no multi-audio file) | — (no multi-audio file) | — (window floor 619 px, 320/390 not reachable) |
| Watched marks | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (double click, delete twice) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Continue watching | 2026-11-08 · 0698684 · Pi · OK · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · KO #170 · [shot](../architecture/qa/2026-11-08-full-pass-pi/03-continue-watching-and-top-rated.jpg) | — (window floor 619 px, 320/390 not reachable) |
| Discover rows | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (bad list/kind, ids probes: 400/404) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Discover search | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (XSS, SQL-ish, empty, 300 chars) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Discover with TMDB unreachable (#179) | — (error-only flow) | 2026-11-08 · local prod build · OK (502 on rows, search, sheet, add) · [report](../architecture/qa/2026-11-08-issue-179-tmdb-unavailable.md) | 2026-11-08 · local prod build · OK (proxy to a closed port) | — (no navigation in this flow) | — (no UI change) | — (no UI change) |
| Title sheet | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (movie/abc, -1, 99999999) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| My list | 2026-11-08 · 0698684 · Pi · OK | 2026-11-08 · 0698684 · Pi · OK (random profile 404, book kind 400) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Play in my library | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · bdc52fc · unit (jsdom) · OK, pending Full QA (#169, [report](../architecture/qa/2026-11-08-issue-169-history-back.md)) | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Admin: accounts | 2026-11-08 · 0698684 · Pi · OK | — (no destructive action by rule) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Admin: devices | 2026-11-08 · 0698684 · Pi · OK | — (no revoke by rule) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Admin: links | 2026-11-08 · 0698684 · Pi · OK | — (no link created or revoked by this pass) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Admin: events | 2026-11-08 · 0698684 · Pi · OK | — (no error path in this flow) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | 2026-11-10 · 11b2edd · Pi · OK ([report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (window floor 619 px, 320/390 not reachable) |
| Libraries add / edit / delete / scan | 2026-11-08 · 0698684 · Pi · KO #163 | 2026-11-08 · f69a401 · inject tests · OK, staging owner replay pending (#163, [report](../architecture/qa/2026-11-08-issue-163-library-root.md)) | — (BLOCKED: Claude in Chrome cannot cut the network, ROB-01) | 2026-11-08 · 0698684 · Pi · OK | — (not audited) | — (window floor 619 px, 320/390 not reachable) |
| Unknown paths (#177) | 2026-11-10 · 11b2edd · Pi · OK (`/`, assets 200) | 2026-11-10 · 11b2edd · Pi · KO #256 (19 / 26 lines fail, [report](../architecture/qa/2026-11-10-full-pass-pi.md)) | — (static page, no network call) | — (no layer) | — (not audited) | — (not audited) |
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
   The spilled popcorn box (#264) shows above the code, the four kernels in the air hop for a
   few seconds then rest (under 5 s), nothing moves with reduced motion, and at 320 / 390 px the
   illustration shrinks without a horizontal scroll; a screen reader skips it.
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

## Duplicate title checks (#176)

1. Put the same film in two libraries (e.g. Films and Animation), scan both: every row,
   the type grid and search show one card; its dialog reads "In: Films · Animation" and
   offers a Copy select.
2. Pick Animation, play a minute, close: the card keeps the keyboard focus, its progress
   follows the Animation copy, Continue watching shows the title once, and reopening the
   dialog starts on Animation.
3. Mark the other copy watched from the Copy select: a mark counts as a save, so that copy
   becomes the current one, the card shows ✓ and reopening starts on it.
4. Two parts of one film (`Part 1`, `Part 2`) and the same title with two different years
   stay two cards; a series present in two libraries still shows twice (spec R2).
5. Discover › a title held twice › "Play in my library": the dialog opens on the title's
   current copy.
6. Two versions in one library (`Heat (1995) - 1080p.mkv`, `- 2160p.mkv`): one card, the
   Copy select reads "Films — <path>" for each.
7. Pick French audio on one copy, switch copy: the Audio select is back on the first track.

## Discover list freshness checks (#257, ADR-0027)

1. Restart the app container, wait 10 s, open Discover: the four rows fill without a
   "Loading…" lasting more than a second; the log has no `/discover` `http.request` above
   1 s.
2. Leave Discover for more than 15 minutes, open it again: the rows show at once (the
   previous lists); the `/discover` `http.request` lines are under 100 ms and the log has
   no `discover.list.refresh_failed`.
3. Start with TMDB unreachable (`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9`):
   one `discover.list.warm_failed` per list (with `list` and `kind`), the app starts,
   Discover shows "TMDB could not be reached".

A stale list kept while its refresh fails needs TMDB to go away on a running server, which
the proxy trick cannot do: the route tests cover it (`routes.test.ts`, ADR-0027).

## Confined FFmpeg input checks (#118, ADR-0028)

1. Next to a real `ok.mkv`, put a text file `trap.mkv` holding `ffconcat version 1.0` and
   `file 'ok.mkv'` (relative), then scan: the log has `library.scan.skipped` with
   `reason: probe_failed` for `trap.mkv` and it is not in the catalog (before #118 it was
   added, probed as `concat`).
2. No-regression: a DASH manifest (`<MPD …>` whose `BaseURL` points at a host you watch)
   named `trap2.mkv` is skipped the same way and the watched host gets no request.
3. Play one real file of each kept container (mkv, webm, mp4, m4v, mov, avi), one direct
   play and one HLS transcode with a resume and a subtitle track: all work as before.
4. Opt-in automated check: `FFMPEG_IT=1 pnpm --filter server exec vitest run src/ffmpeg-input`.

## Replay of #165–#169 and #172–#177 on the Pi (2026-11-10)

Source: [pass of 2026-11-10](../architecture/qa/2026-11-10-full-pass-pi.md).

| Checks | Result |
|---|---|
| #165 search announcements 1, 2, 7 | 2026-11-10 · 11b2edd · Pi · OK (DOM only; screen reader not run) |
| #166 Discover live search 1, 2, 5, 6 | 2026-11-10 · 11b2edd · Pi · OK |
| #167 placeholder contrast 1 | 2026-11-10 · 11b2edd · Pi · OK |
| #168 identity autofill 3 | 2026-11-10 · 11b2edd · Pi · OK |
| #169 back navigation 1, 2, 4 | 2026-11-10 · 11b2edd · Pi · OK |
| #172 title dialog actions 1, 2, 5, 6 | 2026-11-10 · 11b2edd · Pi · OK |
| #173 profile picker name 1, 3 | 2026-11-10 · 11b2edd · Pi · OK |
| #174 device label 1 | 2026-11-10 · 11b2edd · Pi · OK |
| #175 admin polish 1, 2, 4 (disabled state only) | 2026-11-10 · 11b2edd · Pi · OK (3, 5 not run; issue / revoke not run on the live instance) |
| #176 duplicate titles 1 | 2026-11-10 · 11b2edd · Pi · OK (2–7 not run: no matching data) |
| #177 not-found 5 | 2026-11-10 · 11b2edd · Pi · KO #256 |

## Replay on local staging (2026-11-11)

Source: [full pass of 2026-11-11](../architecture/qa/2026-11-11-full-pass-staging.md), production image of `1088e1a` on the local staging tier. TMDB key was a placeholder, so TMDB-dependent checks are not run.

| Checks | Result |
|---|---|
| #164 account menu 1–7 | 2026-11-11 · 1088e1a · local staging · OK |
| #165 search announcements 1–4, 7 | 2026-11-11 · 1088e1a · local staging · OK (5, 6 screen reader not run) |
| #166 Discover live search 2, 5, 6 | 2026-11-11 · 1088e1a · local staging · OK (1, 3, 4, 7–10 BLOCKED: no TMDB) |
| #167 placeholder contrast 1 | 2026-11-11 · 1088e1a · local staging · OK (ratio 6.52) |
| #168 identity autofill 3 | 2026-11-11 · 1088e1a · local staging · OK (1, 2, 4 not run) |
| #169 back navigation 1–4, 7 | 2026-11-11 · 1088e1a · local staging · OK |
| #172 title dialog actions 1, 2, 5, 6 | 2026-11-11 · 1088e1a · local staging · OK (3, 4, 7 not run) |
| #173 profile picker name 1, 3 | 2026-11-11 · 1088e1a · local staging · OK |
| #174 device label 1–4 | 2026-11-11 · 1088e1a · local staging · OK (Firefox, WebKit, curl user agents) |
| #175 admin polish 1, 4, 5 | 2026-11-11 · 1088e1a · local staging · OK (2, 3 not run) |
| #176 duplicate titles 1, 2 (3–7 per screenshots) | 2026-11-11 · 1088e1a · local staging · OK |
| #177 not-found 1–5 | 2026-11-11 · 1088e1a · local staging · OK (`make check-not-found`, 26 / 26) |
| #118 confined FFmpeg input 1–4 | 2026-11-11 · 1088e1a · local staging · OK (avi, mov HLS; m4v, webm direct; seek and resume; avi seeks only within the transcoded part, ADR-0006) |
| #184 where to watch | 2026-11-11 · BLOCKED (no TMDB key) |
| #257 discover list freshness | 2026-11-11 · BLOCKED (no TMDB key) |
| #277 wishlist notifications 5, 9 | 2026-11-11 · 1088e1a · local staging · 5 OK, 9 KO #295 (Escape / outside click); 1–4, 6–8 BLOCKED (no TMDB) |
| #278 personal title link API 3–6 | 2026-11-11 · 1088e1a · local staging · OK (UI 1, 2, 7 BLOCKED: no TMDB) |
| #170 first poster aligned with the title | 2026-11-11 · 1088e1a · local staging · KO #170 (still reproduces, screenshot added) |
| #171 account trigger | 2026-11-11 · 1088e1a · local staging · KO #171 (still reproduces, screenshot added) |
| Rate limits #72 (300 / min API, 3000 / min media) | 2026-11-11 · 1088e1a · local staging · OK (429 then recovery after the window, buckets independent) |
| Lighthouse, sign-in page | 2026-11-11 · 1088e1a · local staging · OK (100 / 100 / 100 / SEO 90, #299) |
| Username format hint on the invitation form | 2026-11-11 · 1088e1a · local staging · KO #298 |
| Responsive 320 px | 2026-11-11 · 1088e1a · local staging · KO #296 (329 px scroll width) |
| axe-core catalog | 2026-11-11 · 1088e1a · local staging · KO #297 (`landmark-unique`) |
| Profile name control characters | 2026-11-11 · 1088e1a · local staging · KO #293 |
| Mark watched with the backend down | 2026-11-11 · 1088e1a · local staging · KO #294 |

## Replay with a real TMDB key on local staging (2026-11-12)

Source: [TMDB pass of 2026-11-12](../architecture/qa/2026-11-12-tmdb-pass-staging.md), production image of `8c1ea1f` on the local staging tier, valid TMDB key (temporary `.env.staging` lines removed afterwards). Closes the BLOCKED rows of the section above.

| Checks | Result |
|---|---|
| #166 Discover live search 1, 3, 4, 7, 8, 10 | 2026-11-12 · 8c1ea1f · local staging · OK · [shot](../architecture/qa/2026-11-12-tmdb-pass-staging/03-live-search-dune.jpg), [cut network](../architecture/qa/2026-11-12-tmdb-pass-staging/04-search-network-cut.jpg) (9 screen reader not run) |
| #257 Discover list freshness | 2026-11-12 · 8c1ea1f · local staging · OK · [shot](../architecture/qa/2026-11-12-tmdb-pass-staging/02-discover-rows.jpg) |
| #184 where to watch | 2026-11-12 · 8c1ea1f · local staging · OK · [offers](../architecture/qa/2026-11-12-tmdb-pass-staging/06-where-to-watch-offers.jpg), [none](../architecture/qa/2026-11-12-tmdb-pass-staging/05-where-to-watch-no-offer.jpg), [load error](../architecture/qa/2026-11-12-tmdb-pass-staging/13-offers-could-not-be-loaded.jpg) (offer links not opened: third party) |
| #277 wishlist notifications 1–4, 6, 7 | 2026-11-12 · 8c1ea1f · local staging · OK · [bell](../architecture/qa/2026-11-12-tmdb-pass-staging/09-bell-badge.jpg), [library line](../architecture/qa/2026-11-12-tmdb-pass-staging/10-bell-library-line.jpg), [provider line](../architecture/qa/2026-11-12-tmdb-pass-staging/19-bell-provider-line.jpg); 6 shows "TMDB could not be reached." for a missing key, KO #304 (wording) |
| #277 case 8 (database without migration 0009) | 2026-11-12 · — (no pre-0009 database available) |
| #278 title link UI 1, 2 | 2026-11-12 · 8c1ea1f · local staging · OK · [form](../architecture/qa/2026-11-12-tmdb-pass-staging/14-link-form.jpg), [refused](../architecture/qa/2026-11-12-tmdb-pass-staging/15-link-refused.jpg), [saved](../architecture/qa/2026-11-12-tmdb-pass-staging/16-link-saved.jpg), [viewer](../architecture/qa/2026-11-12-tmdb-pass-staging/18-viewer-link-no-edit.jpg) |
| #278 title link UI 7 (focus, attributes) | 2026-11-12 · 8c1ea1f · local staging · KO #303 · [shot](../architecture/qa/2026-11-12-tmdb-pass-staging/17-link-edit-remove.jpg) |
| #172 case 3 (Cast line) | 2026-11-12 · 8c1ea1f · local staging · OK · [shot](../architecture/qa/2026-11-12-tmdb-pass-staging/20-series-dialog-cast.jpg) |
| Metadata coverage (OBS-01) | 2026-11-12 · 8c1ea1f · local staging · KO #258 (root cause: TMDB year 2024 vs file 2021, `[tmdbid-891761]` recovers it), KO #259 (overview null), KO #302 (`Show/Season.01/` layout unparsed) |
| Discover with TMDB unreachable | 2026-11-12 · 8c1ea1f · local staging · OK · [shot](../architecture/qa/2026-11-12-tmdb-pass-staging/21-discover-tmdb-down.jpg) |

## Deploy parity and data checks (added 2026-11-10)

Replay on every Pi deploy:

1. `sh scripts/not-found-check.sh https://popcorntv.bb-homelab.local`: every line `ok` (the
   bb-homelab Caddyfile is copied by hand and can drift, #256).
2. Restart the app container, load the home page at once: catalog shown with LCP ≤ 2.5 s (PERF-01); note
   the slowest `/api` call (#257).
3. Per library: unmatched titles and matched titles without a synopsis are counted and each
   one explained (#258, #259).
4. Subtitle and audio menus read language names, not ISO codes (#260).
5. Profile avatars are told apart at a glance (#261).

## Where to watch checks (#184, ADR-0029)

1. Open a recent popular film in Discover: **Where to watch (France)** lists offers grouped
   Subscription / Free / With ads / Rent / Buy with logos and "Data: JustWatch via TMDB".
2. Click an offer: the TMDB watch page of the title opens in a new tab; `window.opener` is
   null there (noopener) and no `Referer` reaches it.
3. Open a library film with a TMDB match: the same block shows; an episode shows none.
4. A title with no French offer (an obscure one): "No legal offer in France for now".
5. TMDB unreachable on a title never opened: "Offers could not be loaded", the sheet works.
6. `GET /discover/logo/abc.png` for a path never handed out → 404 `artwork_not_found`.
7. DevTools Network: no request to any provider domain until the click; no media stream.

## Wishlist notification checks (#277, ADR-0030)

1. On a title sheet with a Subscription offer, **My providers** shows one toggle per
   subscription / free / ads provider (none for Rent / Buy); pressing Netflix persists across a
   reload and per profile (another profile sees it unpressed).
2. Add a title on Netflix to My list, mark Netflix mine: no notification after a check (the
   first look is a baseline, R5).
3. Add a title to My list, then drop its file in a library and scan; after the next check
   (`WISHLIST_CHECK_INTERVAL_MIN=1` on staging) the bell shows **1**; opening it lists
   "*Title* is now in your library" and the count clears; a further check adds nothing.
4. Click a line: the Discover tab opens the title sheet; Play in my library works from it.
5. A profile of another account never sees these lines (`GET /profiles/<theirs>/notifications`
   → 404 `profile_not_found`).
6. `WISHLIST_CHECK_INTERVAL_MIN=0`: no `wishlist.check.done` line in the log; `TMDB_API_KEY`
   unset: no TMDB call, and only titles enriched earlier can match (a new file has no
   `tmdb_id`), so no new library notification.
7. Server log: one `wishlist.check.done` per run; one `notification.created` per line; a TMDB
   outage logs `wishlist.check.title_failed` and the next run catches up.
8. Upgrade an instance whose wishlist already holds titles on disk: no notification for them
   (migration 0009 baseline).
9. Keyboard and screen reader: the bell is reachable by Tab, announced "Notifications, N unread",
   `aria-expanded` follows the panel.

## Personal title link checks (#278, ADR-0031)

1. As the owner, on a Discover title sheet choose **+ Add my link**, paste
   `https://example.org/watch`, Save: **Open my link** appears; it opens a new tab with
   `window.opener` null and no `Referer`.
2. The same title in the library detail dialog (film or series with a TMDB match) shows the
   same link; an episode or an unmatched file shows none.
3. Signed in as a viewer: the link shows, no **Edit link**; `PUT /api/title-links/movie/<id>`
   from the console → 403 `forbidden`.
4. Save `javascript:alert(1)`, `data:text/html,x`, `https://u:p@example.org/`: refused with
   "Enter an http(s) link."; the same bodies sent by `curl` → 400 `invalid_request`.
5. **Edit link** → **Remove**: the button disappears for every viewer.
6. The server log and the container egress (`ss -tnp`) show no connection to the link's
   host; the log has `title_link.set` / `title_link.removed` without the URL.
7. Keyboard: the button, the field and Save / Remove / Cancel are reachable by Tab; the error
   is announced (`role="alert"`).
