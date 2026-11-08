# QA full — PopCornTV on the Pi (2026-11-08)

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| full | 0698684 / none (no deploy note yet; first full pass of this instance) | homelab instance https://popcorntv.bb-homelab.local/ (tailnet only, no staging tier, owner-named host; derogation: owner explicitly asked to QA this instance) | W | qa-tester · Sonnet (product part; security part not run) | not published |

Checklist: `33fcba30f63f`

Pass window (UTC): from 2026-11-08T00:08:30Z to 2026-11-08T00:26:00Z. Owner: `docker compose logs --since 2026-11-08T00:08:00Z --until 2026-11-08T00:27:00Z popcorntv` (the browser clock showed 00:33 local for an invite issued/revoked event listed in Sign-in activity that this pass did not create; the 2:30:41 PM entry is the first setup on 2026-11-07).

## Plan
Level full, product type W (React 19 + Fastify 5 SPA). Domains in: FON, DAT, UI, A11Y, PERF, ROB, USA, PRI. Domains out: MOB (no native app), SEC (security part not run; the probes done on the way are quoted as observations, each row stays NOT TESTED), firmware items. Account: the owner own session (cookie already present); no sign-out, no password, no revoke, no library deleted. Browser: Claude in Chrome (Chrome window floor 619 px).

## QA matrix
Gate ❌ · 🔴 Must 0 · 🟡 Should 6 · 🔵 Nice 9 — 121 checks: Pass 26 · Fail 16 · Mixed 5 · Not tested/N/A 74

Gate note: no Must was found, but applicable P0 items are INCONCLUSIVE or BLOCKED (UI-01 narrow viewports, ROB-01 offline, security part): the line is ⚠️ until the owner records a waiver; failed P0 items (A11Y-01..04, DAT-01/03, UI-07) are Should-level here because the defects are partial and filed.

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| FON-01 | FON | Nominal journey (browse, open, play, resume, mark, Discover, wishlist) | Pass | PASS | walked end to end on the Pi; direct play Sprite Fright, HLS resume Sintel |  | 06-hls-player-sintel.jpg, 20-direct-play-sprite-fright.jpg |
| FON-02 | FON | Paths of the recent specs (discover, audio, search, watched, continue watching, scheduled scan) | Mixed | INCONCLUSIVE | search, watched, Discover, wishlist, continue watching checked; audio select and scheduled scan not exercised (no multi-audio file reachable, scan timer needs server logs); resume drifts +16 s per resume (#55 open) | #55 | 07-library-search-results.jpg |
| FON-03 | FON | Boundaries on inputs | Fail | FAIL | profile name 40 and library name 200 maxlength ok; POST /libraries accepts NUL / nonexistent root | #163 |  |
| FON-04 | FON | Text inputs: unicode, emoji, RTL, whitespace, long | Pass | PASS | RTL + emoji profile name stored and shown intact; whitespace-only refused with alert; 500-char search ok |  |  |
| FON-05 | FON | Numbers and money | Not tested/N/A | N/A | no numeric or money input |  |  |
| FON-06 | FON | Dates and time zones | Mixed | INCONCLUSIVE | admin dates rendered US style regardless of locale (not a parsing bug) | #175 |  |
| FON-07 | FON | Decision tables (role x state) | Not tested/N/A | NOT TESTED | only one owner account; viewer role needs a second account (no seed, not created) |  |  |
| FON-08 | FON | State transitions, back, refresh mid-flow | Fail | FAIL | Back does not close the dialog or the player; reload and Esc fine | #169 |  |
| FON-09 | FON | Error guessing: double click, stale data | Pass | PASS | double-click on Mark as watched left UI and server consistent (finished=true); rapid toggles ok |  |  |
| FON-10 | FON | Forms: required, inline errors, input kept | Pass | PASS | profile add: required, inline role=alert, input kept; library add shows a generic alert (message not specific, see #163) |  |  |
| FON-11 | FON | CRUD lifecycle, search, no result, special chars | Pass | PASS | profile create / rename field / delete with confirm; wishlist add/remove; search with %, quotes, tags; duplicates of one title shown twice (Nice) | #176 | 21-films-view-duplicate-bbb.jpg |
| FON-12 | FON | Regression of previous report | Not tested/N/A | NOT TESTED | previous report 2026-11-06-auth covers the auth lot on another build; no FAIL list to replay |  |  |
| FON-13 | FON | Exploratory session | Pass | PASS | 30 min charter: frustrated user (double clicks, Back, Esc, odd names, bad ids); notes in findings |  |  |
| FON-14 | FON | CLI / library / firmware | Not tested/N/A | N/A | web product |  |  |
| FON-15 | FON | CLI / library / firmware | Not tested/N/A | N/A | web product |  |  |
| FON-16 | FON | CLI / library / firmware | Not tested/N/A | N/A | web product |  |  |
| DAT-01 | DAT | Contract: status codes and error bodies | Fail | FAIL | validation and auth errors use {error,details}; unmatched routes use the Fastify default shape and echo the path (#91 open) | #91 |  |
| DAT-02 | DAT | Persistence across reload | Pass | PASS | progress, profiles, wishlist and watched marks survive reload; restored values re-read through the API |  |  |
| DAT-03 | DAT | Server-side validation | Fail | FAIL | progress, wishlist, discover, subtitles ids and enums refused 400/404; library root not validated for existence or control characters | #163 |  |
| DAT-04 | DAT | Idempotency | Pass | PASS | DELETE watched and wishlist repeated answer 204/404 cleanly; double PUT toggle consistent |  |  |
| DAT-05 | DAT | Pagination and limits | Not tested/N/A | N/A | no paginated route; Discover capped at 20 per list by spec |  |  |
| DAT-06 | DAT | One error model | Fail | FAIL | see DAT-01 | #91 |  |
| DAT-07 | DAT | Time and unicode | Pass | PASS | ISO-8601 updatedAt in UTC; unicode names round trip |  |  |
| DAT-08 | DAT | Queues / workers | Not tested/N/A | N/A | none in this product |  |  |
| DAT-09 | DAT | Webhooks | Not tested/N/A | N/A | none in this product |  |  |
| DAT-10 | DAT | Server restart mid-request | Not tested/N/A | NOT TESTED | cannot restart the Pi service |  |  |
| DAT-11 | DAT | Versioning / CORS preflight / 429 | Not tested/N/A | NOT TESTED | CORS probed lightly (403 csrf on foreign Origin); no burst run (no 429 check) |  |  |
| UI-01 | UI | Viewports 320/390/768/1024/1440, zoom | Mixed | INCONCLUSIVE | Chrome window floor is 619 px: 619 and 1728 px checked, no horizontal overflow; 320 and 390 not reachable with this tool |  | 17-narrow-619-home.jpg, 18-narrow-619-dialog.jpg |
| UI-02 | UI | Console and network after the journeys | Pass | PASS | no console error from the app; extension noise only; every app request 200/204 except my deliberate bad-input probes (400/404); progress list refetched several times after each close (watch #140) |  |  |
| UI-03 | UI | Engines Chromium, Firefox, WebKit | Not tested/N/A | NOT TESTED | only the owner Chrome carries the session cookie |  |  |
| UI-04 | UI | Dark scheme, reduced motion, forced colors, print | Mixed | INCONCLUSIVE | dark by design; prefers-reduced-motion rule present in CSS; not emulated (tool limit) |  |  |
| UI-05 | UI | Every state | Pass | PASS | empty search, missing artwork (title placeholder), empty new profile, empty My list hidden; no blank state found |  |  |
| UI-06 | UI | i18n and spelling | Fail | FAIL | UI English with French metadata (by design); US date format in admin; Cast vs With wording | #175, #172 |  |
| UI-07 | UI | Visual regression, alignment | Fail | FAIL | rows misaligned by 8 px; account trigger text top-aligned; dialog buttons inconsistent | #170, #171, #172 | 02-account-summary-zoom.png, 03-continue-watching-and-top-rated.jpg |
| UI-08 | UI | Favicon, title, 404, deep link | Fail | FAIL | title and favicon present; unknown paths answer 200 with the shell | #177 |  |
| UI-09 | UI | CLI / library matrix | Not tested/N/A | N/A | web product |  |  |
| A11Y-01 | A11Y | Keyboard only | Fail | FAIL | focus ring visible (2 px), modal focus trap and Esc return ok; account menu ignores Esc and outside click; no skip link | #164 |  |
| A11Y-02 | A11Y | Semantics | Fail | FAIL | one h1, h2 per row, landmarks present, images have alt; picker names read "MMe" | #173 |  |
| A11Y-03 | A11Y | Errors announced | Fail | FAIL | profile form alert works; search results and empty states silent | #165 |  |
| A11Y-04 | A11Y | Contrast | Fail | FAIL | placeholder 3.91:1; text 17:1, brand 5.2:1 | #167 |  |
| A11Y-05 | A11Y | Target size | Pass | PASS | all controls >= 32 px (close 32 px: house floor, see #172) | #172 |  |
| A11Y-06 | A11Y | Focus not obscured | Pass | PASS | no sticky header or banner |  |  |
| A11Y-07 | A11Y | Pointer alternative to drag | Not tested/N/A | N/A | no drag interaction (rows scroll with native scrollbar) |  |  |
| A11Y-08 | A11Y | Accessible authentication | Not tested/N/A | NOT TESTED | sign-in not reachable without signing out |  |  |
| A11Y-09 | A11Y | Consistent help, no redundant entry | Pass | PASS | no help control; no data asked twice |  |  |
| A11Y-10 | A11Y | W3C Easy Checks | Mixed | INCONCLUSIVE | title, headings, alt, labels, focus pass; resize text 200 % not run |  |  |
| A11Y-11 | A11Y | axe-core | Not tested/N/A | NOT TESTED | axe not installable on the owner Chrome session; manual checks above |  |  |
| A11Y-12 | A11Y | Reflow 320 / zoom 400 % | Not tested/N/A | NOT TESTED | window floor 619 px |  |  |
| A11Y-13 | A11Y | Orientation, flashing, time limits | Pass | PASS | no lock, no flashing, no timed content |  |  |
| A11Y-14 | A11Y | Screen reader pass | Not tested/N/A | NOT TESTED | no Orca run; live-region gaps found by DOM inspection | #165 |  |
| A11Y-15 | A11Y | Native font scale | Not tested/N/A | N/A | web product |  |  |
| PERF-01 | PERF | Lab budget LCP / CLS / INP | Pass | PASS | LCP 356 ms, CLS 0, load 260 ms on a warm cache over the tailnet (in-page PerformanceObserver, not a throttled Lighthouse run); INP not traced |  |  |
| PERF-02 | PERF | Bundle, caching, compression | Pass | PASS | JS 280 KB raw, 87 KB gzip, hashed assets immutable 1 year, no source map served; gzip only (no brotli) |  |  |
| PERF-03 | PERF | Route latency | Pass | PASS | API calls <= 20 ms; Discover lists memoised |  |  |
| PERF-04 | PERF | Load 1x / 5x | Not tested/N/A | N/A | no load test by rule (L3 nightly local only) |  |  |
| PERF-05 | PERF | Memory on repeated open/close | Not tested/N/A | NOT TESTED | no heap snapshot (DevTools MCP has no session) |  |  |
| PERF-06 | PERF | Mobile start | Not tested/N/A | N/A | web product |  |  |
| PERF-07 | PERF | Workers throughput | Not tested/N/A | N/A | FFmpeg sessions only, not load tested |  |  |
| PERF-08 | PERF | Firmware timing | Not tested/N/A | N/A | no firmware |  |  |
| PERF-09 | PERF | Library / CLI benchmark | Not tested/N/A | N/A | web product |  |  |
| SEC-01 | SEC | Security probe SEC-01 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: headers read with curl: strict CSP (no unsafe-inline, frame-ancestors none, object-src none), nosniff, no-referrer, HSTS, COOP, X-Frame-Options DENY, Permissions-Policy present; no CORP, no Server header |  |  |
| SEC-02 | SEC | Security probe SEC-02 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: session cookie not readable by script (HttpOnly); Secure and SameSite not inspected |  |  |
| SEC-03 | SEC | Security probe SEC-03 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: foreign and null Origin on POST answered 403 csrf; no CORS headers |  |  |
| SEC-04 | SEC | Security probe SEC-04 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: img onerror and svg onload payloads in both searches and profile names render as text, nothing fired |  |  |
| SEC-05 | SEC | Security probe SEC-05 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: unauthenticated API calls answer 401; foreign profile id answers 404 |  |  |
| SEC-06 | SEC | Security probe SEC-06 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: maxlength 100 / 40 / 200 enforced; zod refuses oversized and wrong types |  |  |
| SEC-07 | SEC | Security probe SEC-07 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: no burst run |  |  |
| SEC-08 | SEC | Security probe SEC-08 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: unmatched routes echo the path in the Fastify 404 body (#91) |  |  |
| SEC-09 | SEC | Security probe SEC-09 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: source map URL answers 404; no secret read |  |  |
| SEC-10 | SEC | Security probe SEC-10 | Not tested/N/A | NOT TESTED | security part not run (product part only); observations: no third-party host in the network list (posters proxied) |  |  |
| SEC-11 | SEC | Vertical access control | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-12 | SEC | Sign-out invalidation | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-13 | SEC | Injection beyond XSS | Not tested/N/A | NOT TESTED | security part not run; SEC-13 path traversal and SQL strings on ids and search returned 400/404 with no leak; SEC-17 /.env and /.git answer 200 with the SPA shell (#177) |  |  |
| SEC-14 | SEC | File upload | Not tested/N/A | N/A | no upload / mobile / firmware surface |  |  |
| SEC-15 | SEC | Business logic | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-16 | SEC | Tokens / OAuth | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-17 | SEC | Information leaks | Not tested/N/A | NOT TESTED | security part not run; SEC-13 path traversal and SQL strings on ids and search returned 400/404 with no leak; SEC-17 /.env and /.git answer 200 with the SPA shell (#177) |  |  |
| SEC-18 | SEC | Dependencies | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-19 | SEC | API verb tampering | Not tested/N/A | NOT TESTED | security part not run; never sign out here, no second account |  |  |
| SEC-20 | SEC | Mobile | Not tested/N/A | N/A | no upload / mobile / firmware surface |  |  |
| SEC-21 | SEC | Firmware | Not tested/N/A | N/A | no upload / mobile / firmware surface |  |  |
| ROB-01 | ROB | Network cut / slow | Not tested/N/A | BLOCKED | Claude in Chrome cannot throttle or cut the network |  |  |
| ROB-02 | ROB | Backend down / 500 | Not tested/N/A | NOT TESTED | cannot stop the container; no 5xx observed |  |  |
| ROB-03 | ROB | Kill / restart, health | Pass | PASS | /api/health answers 200 {"status":"ok"} (version exposed, #92) | #92 |  |
| ROB-04 | ROB | Invalid configuration | Not tested/N/A | N/A | instance already configured |  |  |
| ROB-05 | ROB | Two tabs / users | Not tested/N/A | NOT TESTED | single tab, single user |  |  |
| ROB-06 | ROB | Malformed input to parsers | Pass | PASS | {bad JSON, NUL byte, huge numbers refused cleanly; library NUL accepted (#163) | #163 |  |
| ROB-07 | ROB | Logs | Not tested/N/A | NOT TESTED | Pi logs not reachable; window given to the owner |  |  |
| ROB-08 | ROB | Clean install, Docker | Not tested/N/A | N/A | deployed instance |  |  |
| ROB-09 | ROB | Clock skew, disk full | Not tested/N/A | N/A | not reachable |  |  |
| ROB-10 | ROB | Feature flags | Not tested/N/A | N/A | none |  |  |
| ROB-11 | ROB | Firmware safety | Not tested/N/A | N/A | no firmware |  |  |
| ROB-12 | ROB | Chaos | Not tested/N/A | N/A | not run by rule |  |  |
| MOB-01 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-02 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-03 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-04 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-05 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-06 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-07 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-08 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-09 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-10 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-11 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-12 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-13 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| MOB-14 | MOB | Native mobile | Not tested/N/A | N/A | web product, no native app |  |  |
| USA-01 | USA | Nielsen heuristics | Pass | PASS | visibility of status ok, delete confirmed, errors inline; gaps listed in findings |  |  |
| USA-02 | USA | First-time walkthrough | Fail | FAIL | Discover search needs Enter with no hint | #166 |  |
| USA-03 | USA | Error messages | Fail | FAIL | library add error is generic ("Check the name and the folder") | #163 |  |
| USA-04 | USA | Destructive actions confirmed | Pass | PASS | profile delete asks Confirm delete / Cancel; library delete not run (rule); Sign out everywhere one click apart (not clicked) |  |  |
| USA-05 | USA | Feedback timing | Pass | PASS | toggle and dialog feedback immediate, HLS start ~2 s |  |  |
| USA-06 | USA | Consistency | Fail | FAIL | see UI-07, UI-06 | #172, #175 |  |
| USA-07 | USA | CLI | Not tested/N/A | N/A | web product |  |  |
| PRI-01 | PRI | No personal data in URLs or storage | Pass | PASS | only popcorntv.activeProfileId in localStorage; ids only in URLs; tokens not seen |  |  |
| PRI-02 | PRI | Consent | Not tested/N/A | N/A | no non-essential request fires; no banner needed |  |  |
| PRI-03 | PRI | Third-party hosts | Pass | PASS | none from the browser |  |  |
| PRI-04 | PRI | Data subject rights | Not tested/N/A | NOT TESTED | account deletion not exercised |  |  |
| PRI-05 | PRI | Data minimisation | Pass | PASS | sign-in activity shows client IPs (documented in the auth spec); QA data removed |  |  |
| PRI-06 | PRI | Permission strings | Not tested/N/A | N/A | web product |  |  |
| PRI-07 | PRI | Autocomplete, Referrer-Policy | Fail | FAIL | Referrer-Policy no-referrer; name fields trigger identity autofill | #168 |  |

## Findings to act on
1. 🟡 Should — fix(library): refuse a nonexistent folder or a control character in the library root (FON-03, DAT-03) → #163
2. 🟡 Should — fix(web): close the account menu on Escape and on an outside click (A11Y-01) → #164
3. 🟡 Should — fix(web): announce search results and empty states to screen readers (A11Y-03) → #165
4. 🟡 Should — fix(web): raise the contrast of input placeholders to 4.5:1 (A11Y-04) → #167
5. 🟡 Should — fix(web): push the detail dialog on the history stack so Back closes it (FON-08) → #169
6. 🟡 Should — Resume drifts forward about 16 s per H.264 copy resume (Sintel 12:41 to 12:57 after 5 s of play); already filed (FON-02) → #55
7. 🔵 Nice — Discover search needs Enter, no hint (USA-02) → #166
8. 🔵 Nice — identity autofill on name fields (PRI-07) → #168
9. 🔵 Nice — rows start 8 px left of titles (scroll-snap padding) (UI-07) → #170
10. 🔵 Nice — account trigger text top-aligned (UI-07) → #171
11. 🔵 Nice — detail dialog actions and wording inconsistent (UI-07) → #172
12. 🔵 Nice — profile picker accessible names "MMe" (A11Y-02) → #173 (false positive, most likely a textContent read, see `2026-11-09-issue-173-profile-picker-name.md`)
13. 🔵 Nice — raw User-Agent in the device list (USA-06) → #174
14. 🔵 Nice — admin panel polish (US dates, plural, alignment, revoke) (UI-06) → #175
15. 🔵 Nice — same title in two libraries shows twice (FON-11) → #176
16. 🔵 Nice — soft 404 for unknown paths (UI-08) → #177

Already known and re-observed, not re-filed: #55 (resume drift), #91 (unmatched-route error shape, path echoed), #92 (version on /api/health, `{"status":"ok","version":"0.0.0"}`), #83 (current device flag), #157 (audio select without Play), #140 (continue watching refresh), #156 (Discover caches).

## Probe log (edge cases, injections, errors)

| Probe | Result |
|---|---|
| Library search: `elephant`, `halina` (cast), `SINTEL`, `éléphants`, `é`, `%`, whitespace, 500 x `a`, `2010` | finds titles and cast, accent/case folded; `%`, 500 x a, 2010 show "No title or person matches"; whitespace shows the rows |
| Library search XSS `<img src=x onerror=alert(1)>` | text, no img element, no dialog |
| Discover search `dune`, whitespace, `"><svg onload=alert(1)> ' OR 1=1 --`, maxlength | needs Enter; maxlength=100 enforced client side; payload as text, "No title matches.", 0 svg nodes; API refuses q empty and q of 300 chars with 400 |
| Profile names: XSS pair, whitespace, empty, RTL + emoji + accent | XSS stored truncated to 40 as text; whitespace refused (alert "Enter a name of 1 to 40 characters."); empty blocked by required; RTL/emoji ok; both QA profiles deleted via Confirm delete, only Me left |
| Library add `/etc` via UI, `/etc`, `../etc`, `/app/media/../../etc`, existing roots, empty name, NUL, nonexistent | traversal refused 400; existing root 409 root_in_use; empty name 400; nonexistent and NUL accepted 201 (#163), both deleted, 3 libraries remain |
| Path traversal `/api/discover/poster/..%2f..%2fetc%2fpasswd`, `/api/artwork/..%2f`, `/api/artwork/..%2f..%2fetc%2fpasswd` | 404 JSON (path echoed) or SPA shell 200; nothing from disk served |
| `/api/media/<id>/subtitles/999`, `/-1`, `/0` | 404 subtitle_not_found, 400 invalid_request, 200 text/vtt |
| `/api/media/not-a-uuid/file`, random uuid | 400 invalid_request, 404 media_not_found |
| Discover bad ids: `?list=x&kind=y`, `/movie/abc`, `/movie/-1`, `/movie/0`, `/movie/99999999`, `/foo/1` | 400, 400, 400, 400, 404 title_not_found, 400 |
| Wishlist: random profile id, `movie/-5`, `movie/99999999`, `book/603`, DELETE unknown | 404 profile_not_found, 400, 404 title_not_found, 400, 404/204 clean |
| Progress PUT: -1, 1.5, 99999999, `{bad`, bad ids | all 400 invalid_request with details |
| Playback session with bad mediaId and audioIndex 100 | 400 invalid_request |
| Unauthenticated API (curl, no cookie) | 401 {"error":"unauthenticated"} on libraries, me, profiles, artwork, media, discover |
| CSRF: foreign Origin and Origin null on POST /api/auth/login and /logout, 4 calls | 403 {"error":"csrf"} |
| Double click Mark as watched (Sprite Fright), then restore | consistent, row removed after unmark |
| Esc, focus trap, Back, reload with dialog open | Esc ok and focus returns to the card; modal trap ok; Back does not close (#169) |
| Offline | BLOCKED, tool cannot cut the network |

## Inspector review by journey

- Library home: no console error from the app (extension logs only); 26 requests, all 200; artwork lazy (10 on first paint); JS gzip 87 KB.
- Detail / play: HLS via blob, progress PUT 204; the progress list is refetched 3-4 times after a close (redundant, cf. #140).
- Discover: 4 list calls + 40 posters (all 200), title sheet 200; no duplicates beyond the first-load double fetch.
- Profiles / Admin: 200 and 204; deliberate invalid calls 400/404 only.
- Headers (curl): CSP default-src self, script-src self, no inline; HSTS 1 year; nosniff; no-referrer; COOP same-origin; Cache-Control no-cache on the shell, immutable on hashed assets, no-store on /api; gzip only.
- Storage: localStorage `popcorntv.activeProfileId` only; cookie HttpOnly; no service worker, no IndexedDB.

## Server logs (reviewed after the pass)

The owner ran `docker compose logs --since 2026-11-08T00:08:00Z --until 2026-11-08T00:35:00Z
popcorntv` on the Pi and filtered warn, error, fatal, 5xx and invite lines. Result: three
`level 50` lines `TypeError: Cannot use 'in' operator to search for 'tmdbId' in undefined` on
the Discover TMDB error paths, the client having already received the right 404 / 502. Root
cause: a Fastify 5 reply is thenable. Filed and fixed as #178 (PR #180, `9d21ab0`); #179 filed
for a malformed TMDB body. No other warning, error or 5xx in the window. A logging audit brick
follows (too few domain logs, `LOG_LEVEL` ignored).

## Not tested
See the rows marked NOT TESTED / BLOCKED / N/A. To unblock: a viewer account (FON-07, SEC-05 deeper), a throttling tool or Playwright with the session (UI-01 at 320/390, ROB-01, UI-03), server log access (ROB-07, scheduled scan), a series library with episodes (next episode, series watched marks), a multi-audio file (audio track), the security part on Opus (SEC rows).

Restored state: Sintel progress put back to 761 s (it had been resumed once, now 761 s again), Sprite Fright progress row removed, Primetime off My list (wishlist empty), two QA profiles and two QA libraries deleted, window back to full width.

## Delta vs previous report
docs/architecture/qa/2026-11-06-auth.md: different scope (auth lot); no FAIL replay.

## Screenshots
In `docs/architecture/qa/2026-11-08-full-pass-pi/` (01 to 21). Shots showing an identity-manager suggestion list or client IP addresses were discarded for redaction.
