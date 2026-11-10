# QA pass — PopCornTV on the Pi (2026-11-10)

QA pass (level `pass`, scoped to the UI lot #165–#169 and #172–#177, the nominal journeys, SEC-01…10 and ROB-13) on the owner's Raspberry Pi, image `popcorntv:11b2edd`.

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass | 11b2edd / 685bb23 | Pi live instance (https://popcorntv.bb-homelab.local, tailnet only) | W, A | Claude Code · Opus 5.5 | — (not published) |

Checklist: `61702fb560a9`

**Environment decision (owner, 2026-11-10)**: the Pi is the test target for this pass. The site is
tailnet-only and only the owner reaches it, so a separate staging/prod split adds nothing here.
Probes stayed non-destructive; the only data touched is the owner profile's watch position of
*Wing It!* and *Sintel* (normal playback).

Tools: Claude in Chrome (owner's Chrome, signed in as the owner, window floor 619 px), `curl`
from the workstation, `scripts/not-found-check.sh`.

## QA matrix

Gate ⚠️ (PERF-01 INCONCLUSIVE, SEC-07 NOT TESTED) · 🔴 Must 0 · 🟡 Should 2 · 🔵 Nice 4 — 30 checks: Pass 25 · Fail 3 · Mixed 1 · Not tested/N/A 1

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| JRN-01 | FON | Nominal journey: catalog → title → Play → Back | Pass | PASS | Wing It! direct play (`/api/media/:id/file`), Back ×2 closes player then dialog, URL stays `/` | | 01-wing-it-no-synopsis.jpg |
| JRN-02 | FON | HLS + resume | Pass | PASS | Sintel MKV: "Resume from 12:41", hls.js blob source, playing at the credits, 10 subtitle tracks offered | #260 | 02-hls-resume-sintel.jpg |
| LOT-165 | FON | Library search (#165) | Pass | PASS | "1 result for “sintel”" in `role=status`; no-match line; 2 status regions | | 03-search-xss-as-text.jpg |
| LOT-166 | FON | Discover live search (#166) | Pass | PASS | "dune" typed → one `/discover/search` request after the pause, "14 results"; Escape clears; spaces → no request, rows stay | | |
| LOT-172 | FON | Title dialog actions (#172) | Pass | PASS | Play / Watched 44 px high on one row, ✕ 44×44, "Cast:" line on Sintel | | 01-wing-it-no-synopsis.jpg |
| LOT-176 | FON | Duplicate titles (#176) | Pass | PASS | Big Buck Bunny is in Films and Animation; one card per row | | |
| LOT-173 | FON | Profiles incl. the new second profile (#173) | Pass | PASS | picker lists Me and the second profile; avatar `aria-hidden`, name in `.profile-name` | #261 | 04-profile-picker.jpg |
| LOT-169 | FON | Back navigation (#169) | Pass | PASS | `history.state.pctvLayer` 1 → 2, Back closes each layer | | |
| JRN-03 | FON | Administration: libraries Films / Séries / Animation | Pass | PASS | 3 libraries listed, Scan / Refresh / Rename / Delete; no destructive action run | | 05-administration.jpg |
| LOT-175 | FON | Admin dates and counts (#175) | Pass | PASS | 9 ISO 8601 dates with offset, 0 locale dates, "3 devices", Revoke reset link disabled with tooltip | | 05-administration.jpg |
| LOT-174 | FON | Device labels (#174) | Pass | PASS | "Chrome on Linux" ×3 | | |
| OBS-01 | DAT | Metadata coverage, Animation library | Fail | FAIL | 9 / 10 matched; Sprite Fright unmatched; 4 matched titles without French synopsis | #258, #259 | 01-wing-it-no-synopsis.jpg |
| LOT-167 | UI | Placeholder contrast (#167) | Pass | PASS | catalog and Discover search placeholders `rgb(163, 154, 148)` | | |
| UI-02 | UI | Console | Pass | PASS | only browser-extension INFO lines; nothing from the app | | |
| OBS-02 | UI | Responsive 619 px | Pass | PASS | `scrollWidth` 604 ≤ 619, no horizontal scroll; 390 px not reachable in Chrome | | 06-narrow-619-home.jpg |
| OBS-03 | UI | Dark theme | Pass | PASS | `prefers-color-scheme: dark`, body `rgb(14, 11, 13)` | | |
| OBS-04 | UI | Profile colours distinct | Fail | FAIL | pink avatar `rgb(173,20,87)` next to red `rgb(179,18,46)` | #261 | 04-profile-picker.jpg |
| LOT-168 | A11Y | Autofill off (#168) | Pass | PASS | `q`, `library-path`, `library-name` carry `autocomplete="off"` | | |
| PERF-01 | PERF | Fresh home load | Mixed | INCONCLUSIVE | warm: catalog at ~1.1 s, API calls 91–279 ms; owner's 15–20 s not reproduced; Discover cold lists 4.4–6.5 s | #257 | |
| LOT-177 | ROB | Unknown paths answer 404 (#177) | Fail | FAIL | `not-found-check.sh` against the Pi: 19 / 26 fail, `/nope`, `/.env`, `/api` → 200 SPA | #256 | |
| ROB-13 | ROB | Server logs of the pass window | Pass | PASS | window 2026-11-10T13:30+01:00 → 14:15+01:00 read by the owner (`docker logs`, level ≥ 40): only the two expected lines of the SEC-03 probe (`auth.csrf_refused` from `https://evil.test`, `http.request` 403); no error, no stack, no personal data | | |
| SEC-01 | SEC | Security headers | Pass | PASS | CSP without `unsafe-inline`, `frame-ancestors 'none'`, `object-src`/`base-uri 'none'`, nosniff, Referrer-Policy, Permissions-Policy, HSTS, COOP, CORP on API, `no-store` on API, no version leak (`server: Caddy` only on asset 404s) | | |
| SEC-02 | SEC | Cookies | Pass | PASS | session cookie not readable from JS (HttpOnly); detail per #18 spec | | |
| SEC-03 | SEC | Origin / CORS | Pass | PASS | `Origin: https://evil.test` → no `Access-Control-Allow-Origin`; POST with foreign Origin → `403 csrf`; no WebSocket | | |
| SEC-04 | SEC | XSS | Pass | PASS | `"><img src=x onerror=alert(1)>` in search rendered as text, 0 injected `img` | | 03-search-xss-as-text.jpg |
| SEC-05 | SEC | Authn | Pass | PASS | `/api/libraries`, `/api/nope` without session → `401 {"error":"unauthenticated"}` | | |
| SEC-06 / SEC-08 | SEC | Bad payload, error leaks | Pass | PASS | malformed JSON → clean JSON error, no stack, no path | | |
| SEC-07 | SEC | Rate limits | Not tested/N/A | NOT TESTED | a 301-request burst on the owner's live instance was not run; covered by #72 tests | | |
| SEC-09 | SEC | Bundle | Pass | PASS | `main-*.js.map` → 404 | | |
| SEC-10 | SEC | Third parties | Pass | PASS | every request same-origin (TMDB posters proxied by `/api/discover/poster`) | | |

## Findings to act on

1. 🟡 Should — unknown paths answer 200 on the Pi, #177 not live (LOT-177) → #256. Cause: upgrade step 3 of `deploy/homelab/README.md` (Caddyfile copy) skipped.
2. 🟡 Should — 15–20 s "Loading…" on a fresh load not reproduced warm (PERF-01) → #257. Needs a timed cold start with server logs.
3. 🔵 Nice — Sprite Fright (2021) unmatched (OBS-01) → #258.
4. 🔵 Nice — no French synopsis for Caminandes: Llamigos, Charge, Coffee Run, Wing It!: fall back to English (OBS-01) → #259.
5. 🔵 Nice — subtitle tracks labelled `ger`, `fre`… (JRN-02) → #260.
6. 🔵 Nice — pink avatar too close to red (OBS-04) → #261.

## Not tested

Row IDs: `JRN-` journeys, `LOT-<issue>` replays of the lot's own checks (`docs/testing/qa-matrix.md`), `OBS-` observations; checklist IDs only where the check is that item. Level `pass`: the checklist items not listed here were not run (previous full pass: `2026-11-08-full-pass-pi.md`).

- Lot checks not run: #165 3–6 (screen reader), #166 3, 4, 7–10 (timing, throttling, IME), #167 2–4, #168 1, 2, 4 (password manager), #169 3, 5–7, #172 3, 4, 7, #173 2, #174 2–4 (other browsers and clients), #175 3, 5, #176 2–7 (no matching data). Unblock: Orca session, DevTools throttling, second browser.

- SEC-07 — NOT TESTED: no burst on the live instance.
- Responsive 390 / 768 px — Chrome window floor 619 px; Playwright cannot sign in without the owner's password.
- Offline / network cut — Claude in Chrome cannot cut the network (ROB-01).

## Delta vs previous report

`2026-11-08-full-pass-pi.md`: fixed 8 (#165, #166, #167, #168, #172, #173, #174, #175 verified on the Pi); still failing 3 (#170, #171 open, not replayed; #177 not live → #256); new 6 (#256–#261).

## New checks proposed for the checklist

- Deploy parity: after any deploy, run the repo's own live checks (`not-found-check.sh`) against the deployed origin — the proxy config can drift from the repo.
- Cold-start timing: restart the container, then time the first page load (network waterfall + `http.request` durations).
- Metadata coverage: count unmatched titles and matched titles without a localised synopsis per library.
- Language labels: subtitle and audio menus show language names, not codes.
- Profile identity: profile avatars are told apart by colour and initial.
