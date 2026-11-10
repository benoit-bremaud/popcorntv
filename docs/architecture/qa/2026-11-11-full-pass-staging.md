# QA pass — PopCornTV on local staging (2026-11-11)

Full pass (level `full`, product and security parts run in one session) of the production image of `1088e1a` on the local staging tier (`make staging-up`, Caddy `tls internal` at https://localhost:8443), before the next Pi deploy.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| full | 1088e1a / 11b2edd (image on the Pi, last QA 2026-11-10) | local staging (`popcorntv-staging`, image `popcorntv:staging-1088e1a`) | W, A | Claude Code · Sonnet 5.5 | — (not published) |

Checklist: `61702fb560a9`

**Environment**: local staging only; the Pi was never touched. TMDB key is a placeholder
(`TMDB_API_KEY not set`, Discover answers `409 tmdb_not_configured`, the UI "TMDB could not be
reached."), so every TMDB-dependent check is `BLOCKED`. Accounts: `qa-tester` (owner, seeded) plus
`qa-viewer` and `qa-viewer2` created through the invitation flow and deleted at the end.
Test data: generated 20 s H.264/AAC clips in `./media` (two libraries, a duplicate title across
them, two versions of one film, an MKV with subtitles and two audio tracks, a two-episode series,
containers avi / m4v / mov / webm, two `ffconcat` / DASH trap files).

Tools: Playwright (system Chrome headless, Firefox, WebKit, `ignoreHTTPSErrors`), axe-core 4.14,
`curl -k`, `make check-not-found`, `docker logs`. Orca (screen reader) missing; Lighthouse 12 run through `npx lighthouse` on the sign-in page. The Playwright scripts lived in `apps/web/qa-tmp-*.mjs` and were
deleted; none is committed.

## QA matrix

Gate ⚠️ (3 Should open on the product, TMDB-dependent P0/P1 checks BLOCKED, screen reader NOT TESTED) · 🔴 Must 0 · 🟡 Should 3 · 🔵 Nice 6 — 54 checks: Pass 40 · Fail 7 · Mixed 2 · Not tested/N/A 5

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01 | FON | Nominal journey: sign-in, profile, catalog, title, Play (direct), Back | Pass | PASS | direct play via `/api/media/:id/file`, Back closes the player then the dialog, URL stays `/` | | 02-profile-picker.png, 05-player-direct.png |
| JRN-02 | FON | HLS transcode, resume, next episode | Pass | PASS | MKV plays through hls.js, "Resume" offered after 12 s watched (rule: 10 s), episode player opens the next episode | | 09-hls-player.png, 10-episode-player.png |
| JRN-03 | FON | Continue watching row and watched marks | Pass | PASS | row shows the title once, ✓ mark on the poster, unmark forgets it | | 06-continue-watching-dup.png, 07-watched-mark.png, 08-continue-watching-row.png |
| JRN-04 | FON | Administration: accounts, reset link, devices, events | Pass | PASS | reset link issued and revoked, invitation redeemed, last owner protected | | 12-administration.png, 13-admin-reset-link.png |
| JRN-05 | FON | Profile management and redeem form | Pass | PASS | create, rename, delete; redeem with a bad token shows the error | | 22-manage-profiles.png, 23-redeem-form.png, 24-redeem-error.png |
| LOT-164 | FON | Account menu (#164) 1–7 | Pass | PASS | Escape closes and focus returns to the summary; a click in the header closes it; Change password keeps it open; Escape in the search clears the query, closes the menu, keeps focus in the box; sign-out with the server down keeps the menu open with "The server could not be reached." | | 11-account-menu.png, 16-change-password.png, 17-signout-server-down.png |
| LOT-165 | FON | Search announcements (#165) 1–4, 7 | Pass | PASS | "1 result for “sintel”" once, "No match for “zzzzq”", cleared field leaves no stale count, spaces announce nothing, one status region; 5, 6 (screen reader) not run | | 03-search-result.png |
| LOT-166 | FON | Discover live search (#166) | Mixed | BLOCKED | 2 (one request when typing fast), 5 (spaces only: no request), 6 (Escape clears) PASS; 1, 3, 4, 7–10 need TMDB answers | | 14-discover-no-tmdb.png |
| LOT-167 | UI | Placeholder contrast (#167) | Pass | PASS | `rgb(163, 154, 148)` on `rgb(27, 21, 24)`, ratio 6.52 | | |
| LOT-168 | A11Y | Identity autofill (#168) 3 | Pass | PASS | search box `autocomplete="off"`; 1, 2, 4 (password manager) not run | | |
| LOT-169 | FON | Back closes layers (#169) 1–4, 7 | Pass | PASS | `history.state.pctvLayer` 1 then null, Escape leaves no dead entry, double Back closes both, close-then-reopen stays open | | |
| LOT-172 | FON | Title dialog actions (#172) 1, 2, 5, 6 | Pass | PASS | ✕ 44×44, Play and Mark as watched 44 px high on one row, Copy select present; Cast line needs TMDB data (3, 4, 7 not run) | | 31-w1440-dialog.png |
| LOT-173 | A11Y | Profile picker name (#173) 1, 3 | Pass | PASS | accessible name without the initial, avatar `aria-hidden`; names with emoji, RTL, `<img>` and `${7*7}` shown as text | | 02-profile-picker.png |
| LOT-174 | FON | Device labels (#174) 1–4 | Pass | PASS | Chrome, Firefox and WebKit sessions plus curl user agents: "Firefox on Linux", "Safari on macOS" (WebKit), "Firefox on Windows", "Safari on iOS", "Edge on macOS", "Chrome on Android"; non-browser clients show their raw token ("curl/8.5.0"), an empty user agent reads "Unknown device", headless Chrome reads "Device on Linux", a markup user agent is shown as text | | 41-device-labels.png |
| LOT-175 | FON | Admin dates and counts (#175) 1, 4, 5 | Pass | PASS | ISO 8601 with offset under fr-FR / en-US (Los Angeles) / ja-JP (Tokyo), 0 locale dates; Revoke reset link disabled with "No pending reset link"; stale revoke leaves `[]` | | 12-administration.png |
| LOT-176 | FON | Duplicate titles (#176) 1, 2 measured; 3–7 per screenshots | Pass | PASS | Big Buck Bunny in two libraries shows one card per row, "Copy" select, card keeps focus after close, Continue watching shows the title once | | 06-continue-watching-dup.png, 07-watched-mark.png |
| LOT-177 | ROB | Unknown paths answer 404 (#177) | Pass | PASS | `make check-not-found`: 26 lines `ok`, `/nope`, `/.env`, `/.git/config`, `/api` miss → 404, `/` and hashed assets 200, 404 page sends the CSP | | 33-w390-404.png, 34-404-dark-1440.png |
| LOT-118 | ROB | Confined FFmpeg input (#118, ADR-0028) 1–4 | Pass | PASS | `trap.mkv` (ffconcat) and `trap2.mkv` (DASH) logged `library.scan.skipped reason=probe_failed`, absent from the catalog; played in Chrome: m4v and webm direct (206 ranges, 416 beyond the end), avi and mov through HLS (h264 + mp3 / aac segments, hls.js); seek to 14 s works on m4v, webm, mov, "Resume from 0:16" offered after close; avi seeks only to the 12 s transcoded so far (EVENT playlist, by design: ADR-0006 § 5d, seek-ahead follow-up); `startSec` 12 honoured, 9999 → 0, -5 → 400, unknown media → 404 | | 40-container-m4v-player.png |
| LOT-257 | FON | Discover list freshness (#257) | Not tested/N/A | BLOCKED | needs TMDB | | |
| LOT-184 | FON | Where to watch (#184) | Not tested/N/A | BLOCKED | needs TMDB | | |
| LOT-277 | FON | Wishlist notifications (#277) 5, 9 | Mixed | BLOCKED | 5: another account's profile → 404 `profile_not_found` for notifications, providers, wishlist; 9: bell has `aria-expanded` and `aria-controls` but no Escape or outside-click close; 1–4, 6–8 need TMDB | #295 | 15-bell-open.png |
| LOT-278 | FON | Personal title link (#278) API 3–6 | Pass | PASS | viewer PUT / DELETE → 403 `forbidden`, GET shows `editable:false`; `javascript:`, `data:`, credentials, `ftp:`, 2 100 chars, `{}` → 400 `invalid_request`; owner set, read, delete → 204, link null after; log has 8 `title_link` lines, none with the URL, no socket to the host; UI cases 1, 2, 7 need a Discover sheet | | |
| UI-01 | UI | Responsive 320 / 390 / 768 / 1024 / 1440 / landscape 844 | Fail | FAIL | 320 px: `scrollWidth` 329 > 320, `.account` / `.account-panel` right edge 329; every other width and the dialog, Administration and 404 page clean | #296 | 30-w320-catalog.png, 31-w320-dialog.png, 32-w320-admin.png, 33-w320-404.png |
| UI-02 | UI | Console and network, Chrome | Pass | PASS | 0 errors, 0 warnings, 0 page errors on login, catalog, dialog, Administration; one origin (`localhost:8443`); WebKit showed one transient error line in one run and none on rerun | | |
| UI-03 | UI | Firefox and WebKit render | Pass | PASS | sign-in, 31 posters, dialog opens; 0 Firefox console errors | | 37-firefox-dialog.png, 37-webkit-dialog.png |
| UI-04 | UI | Dark, forced colors, print | Pass | PASS | dark 404 and catalog readable, forced-colors keeps borders and text, print shows rows | | 34-404-dark-1440.png, 35-forced-colors-catalog.png, 36-print-catalog.png |
| UI-05 | UI | Reduced motion | Pass | PASS | 404 page animations off; catalog keeps 0.2–0.5 s fades by design (tokens.css: "gentler, not zero"), travel and loops removed | #265 | |
| A11Y-01 | A11Y | axe-core 4.14: login, catalog, dialog, Administration | Fail | FAIL | `landmark-unique` (moderate) on the catalog: two `nav` named "Catalog"; other screens 0 violations | #297 | |
| A11Y-02 | A11Y | Keyboard only | Pass | PASS | focus ring `solid 2px` on every stop through the profile picker; dialog and menus reachable and closable | | |
| A11Y-03 | A11Y | Target size ≥ 24 px (Administration) | Pass | PASS | 0 interactive elements under 24×24 | | |
| A11Y-04 | A11Y | Screen reader | Not tested/N/A | NOT TESTED | Orca missing (`qa-doctor.sh`) | | |
| PERF-01 | PERF | Signed-in reload and Lighthouse on the sign-in page | Pass | PASS | reload: LCP 88 ms, CLS 0.000, 19 `/api` calls; Lighthouse 12 on the sign-in page, desktop and mobile: Performance 100, Accessibility 100, Best practices 100, SEO 90 (LCP 0.2 s desktop, 0.8 s mobile, CLS 0, TBT 0 ms); signed-in catalog not audited (the profile choice lives in local storage, Lighthouse cannot set it) | #299 | 58-no-meta-description.png |
| DAT-02 | DAT | Persistence across a container restart | Pass | PASS | accounts, profiles, progress and libraries survive `docker restart` | | |
| DAT-03 | DAT | Unknown enum values and foreign ids | Pass | PASS | `/title-links/book/603` and `/movie/abc` → 400, random profile id → 404 | | |
| FON-03 | FON | Profile name probes | Fail | FAIL | XSS, SQL-ish, RTL, emoji, template strings accepted and shown as text; `a<LF>b` accepted (library names refuse control characters) | #293 | 22-manage-profiles.png |
| ROB-01 | ROB | Backend down: mark watched | Fail | FAIL | with the app container stopped, "Mark as watched" shows nothing and the button state does not change | #294 | 20-offline-mark-watched.png |
| ROB-02 | ROB | Backend down: Play, reload, sign-out | Pass | PASS | Play shows "This file could not be played.", reload shows the catalog error with Retry, Retry recovers, sign-out keeps the menu with the error | | 18-backend-down-play.png, 19-reload-backend-down.png, 21-offline-play.png |
| LOT-170 | UI | First poster aligned with the row title (#170) | Fail | FAIL | still reproduces: Films row at 1440 px and Continue watching / Films at 390 px start with `scrollLeft` 8, first poster at x = 8 px, title at x = 16 px | #170 | 54-first-poster-offset-170.png |
| LOT-171 | UI | Account menu trigger (#171) | Fail | FAIL | still reproduces: `summary.account-summary` 62 px high (66 px at 390 px), `display: list-item`, text 9 px from the top and 31 px from the bottom; switcher and bell are 44 px | #171 | 55-account-trigger-171.png |
| FON-05 | FON | Username format feedback on the invitation form | Fail | FAIL | `a b` refused with the browser's "Please match the requested format."; no title or hint states the allowed characters | #298 | 57-username-format-message.png |
| ROB-13 | ROB | Server logs of the pass window | Pass | PASS | 2026-11-11T00:03:59+01:00 → 00:36:34+01:00, 1 376 lines, all JSON: 1 328 info, 48 warn (16 × 403 and 16 × 429 from the probes, 7 `auth.login_failed`, 1 `auth.login_locked`, 3 `auth.csrf_refused`, 2 `library.scan.skipped` traps, 3 TMDB-not-set notices); 0 level ≥ 50, no 5xx, no stack, no password, token or cookie | | |
| SEC-01 | SEC | Security headers | Pass | PASS | CSP `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, no `unsafe-inline`; HSTS, nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, Permissions-Policy, COOP; API `no-store` + CORP `same-origin`; no `Server` version leak | | |
| SEC-02 | SEC | Cookies | Pass | PASS | `__Host-pctv_session`, `Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=7776000`; `document.cookie` empty; local storage holds only the active profile id, session storage empty | | |
| SEC-03 | SEC | Origin / CORS | Pass | PASS | `Origin: https://evil.test` and `null` → no `Access-Control-Allow-*`; POST with a foreign Origin → `403 csrf` | | |
| SEC-04 | SEC | XSS | Pass | PASS | search and profile name payloads render as text, 0 injected nodes | | 04-search-xss-as-text.png |
| SEC-05 | SEC | Authn / authz | Pass | PASS | 12 routes without a session → 401; viewer on 13 owner routes → 403; viewer on the owner's profile routes and a random id → 404 | | |
| SEC-06 | SEC | Input limits | Pass | PASS | malformed JSON → `400 invalid_request`, 100 kB name → 400 with the size message, the server stays up | | |
| SEC-07 | SEC | Rate limits (#72, ADR-0011) | Pass | PASS | 320 calls on `/api/profiles` from one client: 295 × 401 then 25 × 429 (`retry-after`, `x-ratelimit-limit: 300`, `{"error":"too_many_requests"}`); during the 429 window a media range request still answered 206, `/api/health` 200 and the static page 200, while `/api/libraries` (authenticated) and `/api/auth/status` answered 429 (one bucket per client address); after the window (61 s) 401 and 200 again; media bucket: 3 050 calls on `/api/health` → 3 000 × 200 then 50 × 429 (`x-ratelimit-limit: 3000`), the normal bucket stayed open (`/api/libraries` 200), recovered after 62 s; the app container stayed healthy; login throttle 5 failures → 429 `login_locked` | | |
| SEC-08 | SEC | Error leaks | Pass | PASS | 400, 401, 403, 404 bodies are `{ "error": … }` only; no stack, path or version | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `main-*.js` 200 gzip, immutable cache, `.map` → 404; the only "API_KEY" match is the UI sentence "TMDB_API_KEY is not set" | | |
| SEC-10 | SEC | Third parties | Pass | PASS | every request to `localhost:8443` | | |
| SEC-11 | SEC | Viewer cannot reach owner routes | Pass | PASS | see SEC-05 | | |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware in this product | | |
| OBS-01 | DAT | Metadata coverage | Not tested/N/A | BLOCKED | TMDB not configured | #258, #259 | |

## Findings to act on

Each issue embeds its own screenshot (the images resolve on GitHub once this report PR is merged to `main`).

1. 🟡 Should — a profile name accepts control characters (FON-03) → #293, `50-profile-control-char-293.png`. `apps/server/src/profiles/routes.ts:10` has no refine; library names use `hasControlChar`. Related #225.
2. 🟡 Should — "Mark as watched" fails silently when the server is down (ROB-01) → #294, `56-mark-watched-silent-294.png`. `DetailDialog.tsx:133` ignores the boolean returned by `markWatched`.
3. 🟡 Should — page scrolls horizontally at 320 px (UI-01, WCAG 1.4.10) → #296, `52-320px-overflow-296.png` and `52b-320px-overflow-scrolled-296.png`.
4. 🔵 Nice — the notification bell panel does not close on Escape or an outside click (LOT-277 9) → #295, `51-bell-stays-open-295.png`.
5. 🔵 Nice — two `nav` landmarks both named "Catalog" (A11Y-01) → #297, `53-two-nav-catalog-297.png`.
6. 🔵 Nice — the invitation and setup forms do not state the allowed username characters (FON-05, the Nice defect lost in the context reset, recovered from `24-redeem-error.png`) → #298, `57-username-format-message.png`.
7. 🔵 Nice — no `<meta name="description">`, Lighthouse SEO 90 (PERF-01) → #299, `58-no-meta-description.png`.
8. 🔵 Nice — #170 (first poster 8 px left of the row title) and #171 (account trigger text top-aligned) still reproduce on `1088e1a`; replay evidence and screenshots added as comments → `54-first-poster-offset-170.png`, `55-account-trigger-171.png`.
9. Backlog — real TMDB key for staging QA → #300.

Also noted, already tracked: #265 (hero Ken Burns finite loop), #225, #258, #259 (BLOCKED here).

Observed and not filed: HLS seeking past the transcoded part is impossible (ADR-0006 § 5d, spec hls-transcode 5d, seek-ahead follow-up already documented); the direct file route answers `application/octet-stream` for `.avi` and `.mov` (those files are always served through HLS, so no player is affected); an unmatched `/api/...` route inside the app answers Fastify's default 404 body (`message`, `statusCode`), tracked as #91.

## Not tested

- BLOCKED (TMDB placeholder key, unblock: #300): #184 where to watch, #277 cases 1–4, 6–8, #278 UI cases 1, 2, 7, #257 list freshness, #166 cases 1, 3, 4, 7–10, #172 case 3 (cast line), OBS-01 metadata coverage.
- NOT TESTED: #165 5, 6 and A11Y-04 (no Orca screen reader), #168 1, 2, 4 (password manager), Lighthouse on the signed-in catalog (the profile is chosen in local storage, so a bare Lighthouse run only reaches the sign-in page and the profile picker).
- Pi checks (the post-deploy smoke after the Pi upgrade) are outside this pass.

Gaps closed in the follow-up session of the same day (owner approval): #118 3–4 (every container played, seek and resume), the global and media rate limits (burst and recovery), Lighthouse on the sign-in page, #174 2–4 (Firefox, WebKit, curl user agents), #170 and #171 replays, the lost Nice defect.

## Delta vs previous report

`2026-11-10-full-pass-pi.md`: #177 now verified on a fresh image (26 / 26 lines ok; the Pi still needs its Caddyfile, #256); #165–#169, #172–#176 replayed, #176 cases beyond 1 now run; new #293–#300; #170 and #171 replayed, both still open; #257–#261 unchanged (PERF-01 not reproduced locally: LCP 88 ms).

## Verdict for the Pi deploy of 1088e1a

No 🔴 Must. Nothing found blocks a Pi deploy of `1088e1a`: the three Should (#293, #294, #296) are display, input-validation and reflow polish. Gate ⚠️ because the TMDB-dependent checks (#184, #277, #278 UI, #257) were not runnable here and must be smoke-checked on the Pi, which has a real TMDB key, after the deploy; upgrade step 3 of `deploy/homelab/README.md` (Caddyfile copy, #256) is required for #177 to be live on the Pi.

## New checks proposed for the checklist

- Reflow at 320 CSS px on every signed-in screen (WCAG 1.4.10), with the account menu open.
- axe `landmark-unique` on screens with more than one `nav`.
- Control characters in every free-text name field, not only the library.
