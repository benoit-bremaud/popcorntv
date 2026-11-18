# QA pass on the Pi staging (2026-11-19)

Level pass, owner-session scope, read-only plus reversible state. A full pass by another tester ran in parallel on the same instance.

| Level | Head SHA | Environment | Targets | Agent |
|---|---|---|---|---|
| pass | 8a3be17 | Pi staging, port 8443, deploy/pi-staging | W | qa-tester (Sonnet), Claude in Chrome |

Playwright and the built-in browser refused the private CA; no bypass was attempted.

## Results

| ID | Check | Verdict | Evidence |
|---|---|---|---|
| FON-01 | First screen, setup form | PASS | 01-setup-form |
| UI-02 | Console and network | PASS | no product error; same-origin only; /api/discover 409 x4 expected (TMDB unset) |
| SEC-01 | Security headers | PASS | strict CSP, XFO DENY, nosniff, no-referrer, Permissions-Policy, HSTS, COOP, CORP on API; no Server header |
| SEC-01 | Via header (Caddy) on /api/* | FAIL (Nice) | ISSUE_VIA |
| SEC-02 | Session cookie | INCONCLUSIVE | absent from document.cookie (HttpOnly confirmed); Secure, SameSite, Path not observable (no header access) |
| SEC-05 | /api/* without session | PASS | 401 unauthenticated |
| SEC-08 | 404 | PASS | static 404, no leak (02-not-found) |
| DAT | API cache | PASS | no-store on /api/version, /libraries, /profiles, /auth/events, /users; assets immutable |
| SEC | CSRF | PASS (observed) | every call same-origin; nothing forged |
| FON | Profile picker, manage profiles | PASS | 03-manage-profiles (Delete enabled on the only profile, not clicked) |
| FON | Empty catalog | PASS | 04-empty-catalog |
| FON | Administration | PASS | 05, 06; one folder listed under MEDIA_ROOT (qa-full-2026-11-18), nothing added |
| UI | Account menu version | FAIL (Nice) | shows dev; GET /api/version returns dev, not 8a3be17; ISSUE_VER; 09 |
| UI | Discover without TMDB | FAIL (Nice) | "could not be reached" on a 409; existing #304; 07 |
| A11Y | Bell panel Escape / outside click | FAIL (Nice) | stays open; existing #295; 07, 08 |
| A11Y | Keyboard order, focus ring | PASS | 2 px outline on header, tabs, search |
| A11Y | Setup token field | FAIL (Nice) | type=text; ISSUE_TOK; 01 |
| FON | Setup link prefill | NOT TESTED | owner exists; code prefills the setup fragment (setupTokenFromHash); not reproducible now |
| FON | Back closes dialogs (#169) | BLOCKED | no title dialog without media |
| UI | Responsive 390 / 768 | NOT TESTED | Chrome window resize does not change the viewport |

## Still blocked

Playback (direct, HLS, subtitles, audio), resume, watched marks, search results, wishlist add/remove, TMDB-backed Discover and title sheet (no media, TMDB unset), Secure / SameSite cookie flags, TLS cert subject, CORS foreign Origin, rate limit, mobile layout, ROB-13 server logs.
