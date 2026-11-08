# Project log — PopCornTV

Chronological operational logbook (newest first). Complements `git log` with the human
context: merged PRs, decisions, tags, infra events. Not a release changelog — that is
`CHANGELOG.md`. Entries before 2026-10-24 #27 use the former name, Popcorno.

## 2026-11-09 — #172 title dialog actions harmonised (PR #239 merged, `eb3d131`)

- MCDA option A (owner, 450/500): the watched toggle joins `.detail__actions`; the row's
  buttons are `--radius-pill` pills at least `--touch-target` (44 px) high; the close button
  is 44×44 px with the title kept clear of it; one ✕ glyph; the Discover sheet says
  "Cast:" like the library dialog. The alternatives scored 375 (square chips) and 315
  (move only). No ADR.
- Staging replay pending: `docs/architecture/qa/2026-11-09-issue-172-title-dialog-actions.md`.
- Gate: typecheck, lint, format, coverage, build, e2e, gitleaks and SonarQube are all
  green. Adversarial review: 0 Must; 3 Should and 1 Nice fixed and verified. One Nice was
  left open (a ternary in place of two conditions that mean the same thing).

## 2026-11-09 — #168 identity autofill stopped on name and search fields (PR #237 merged, `3d527c2`)

- MCDA option A (owner, 430/500): `autocomplete="off"` and a `name` on the catalog and
  Discover searches, the profile name and the library name, path, rename and
  delete-confirmation fields (PRI-07). The alternatives scored 365 (vendor `data-*`
  opt-outs as well) and 255 (a bogus token). No ADR.
- Credential fields keep `username` / `current-password` / `new-password`, pinned by
  `auth/autocomplete.test.tsx` and `AccountMenu.test.tsx`.
- Closing the issue covers the markup only. Vendor opt-outs are added only if the
  pending staging replay fails (`docs/architecture/qa/2026-11-09-issue-168-identity-autofill.md`).
- Gate: typecheck, lint, format, coverage, build, e2e, gitleaks and SonarQube are all
  green. Adversarial review: 0 Must; 1 Should and 2 Nice fixed and verified. Out of scope:
  one flaky server test (1 failure in 4 runs) and the change-password form, which has no
  username field.

## 2026-11-09 — #167 placeholder contrast raised to 4.5:1 (PR #235 merged, `6fa47e9`)

- MCDA option A (owner, 500/500): one global `::placeholder` rule using
  `--color-text-muted` at `opacity: 1`. The alternatives scored 420 (a dedicated token)
  and 390 (per-class rules, which miss the unclassed inputs). No ADR.
- Ratios (WCAG 2.x): 5.94:1 on `--color-surface-raised` and 6.52:1 on `--color-surface`.
  The user-agent grey was 3.56:1 and 3.91:1 (A11Y-04 in the 2026-11-08 full pass).
- `tokens.test.ts` computes the ratios from `tokens.css`. Vitest keeps that file
  unblanked (`test.css.include`).
- Gate: typecheck, lint, format, coverage, build, e2e, gitleaks and SonarQube are all
  green. Adversarial review: 0 Must; 2 Should fixed and verified. Staging replay pending
  (`docs/architecture/qa/2026-11-09-issue-167-placeholder-contrast.md`).

## 2026-11-09 — #166 Discover search made live (PR #233 merged, `38ff494`)

- MCDA option A (owner, 410/500 vs a Search button 385, debounce plus button 385). The
  Discover search now behaves like the library search.
  - The trimmed query is sent 400 ms after the last keystroke (`SEARCH_DEBOUNCE_MS`), and
    Enter sends it immediately.
  - An unchanged query is not sent again unless its last attempt failed; Enter or the
    next pause then retries it.
  - A blank query is never sent, and nothing is sent while an input method composes.
  - A late answer for an older query is dropped, and Escape clears the field.
  - The #165 `LiveStatus` region is unchanged; each search is announced as it starts and
    as it ends.
  - Spec discover-wishlist R2 is updated. No ADR and no change to the component diagram.
- Tests: 13 new jsdom cases using fake timers and `fireEvent`, because user-event hangs
  under fake timers.
- Gate:
  - The Opus adversarial round 1 raised a Must: Enter did not retry a failed query. It was
    fixed with `sent = null` on failure.
  - It also raised three Shoulds: a false e2e claim in the QA record, the IME debounce,
    and per-search announcements (documented as intentional). The verify round passed.
  - The local gate passed: web 353 tests, `pnpm e2e`, gitleaks and SonarQube.
- QA matrix § #166 has 10 checks. The staging replay is pending
  (`docs/architecture/qa/2026-11-08-issue-166-discover-live-search.md`).

## 2026-11-08 — #165 search results and empty states announced (PR #229 merged, `2f18382`)

- MCDA option B (owner, 435/500 vs immediate per-keystroke 335, live visible heading 260):
  shared `a11y/LiveStatus` polite region (`role="status"`, explicit `aria-live` /
  `aria-atomic`, always mounted) + `useSettledMessage` (500 ms pause, empty clears at
  once). Library: *N results for "…"* / *No match for "…"*; Discover (submit-based, no
  delay): in flight, count, no match, TMDB failure. Loading and empty catalog states keep
  one leading region whose text changes; the welcome keeps its landmark. Specs search
  R3/R4 and discover-wishlist R2, component diagram 03 updated; no ADR.
- Tests: 15 new jsdom cases (fake-timer debounce, singular / plural, blank, cleared,
  failure, region identity); gate green (Sonar PASSED after S6819 ×3 fixed, e2e 2/2,
  gitleaks). `history-layer.test.tsx` flaked once under full-suite load (untouched file).
- Review: Opus adversarial 2 rounds — owner welcome mounted with its text (fixed), missing
  diagram and QA record (added).
- QA: `docs/testing/qa-matrix.md` § Search announcement checks; report
  `docs/architecture/qa/2026-11-08-issue-165-search-announcements.md`, Orca replay pending.
  Follow-up seen: `<output>` messages in AccountMenu / LibrarySection / AdminPanel /
  PlayerDialog mount with their text.

## 2026-11-08 — #164 account menu closes on Escape and outside click (PR #227 merged, `e28c34a`)

- MCDA option A (owner, 480/500 vs `useDismiss` hook 420, `popover` API 205): `AccountMenu`
  adds document `keydown` / `pointerdown` listeners while open. Escape closes it, focus back
  on the summary only when it was inside (search box / poster keep focus), skipped while a
  `dialog[open]` is above (ADR-0024) or during IME composition; pointer-down outside closes
  without swallowing the click; Administration closes it; failed sign-out keeps it open.
  No spec or ADR change.
- Tests: 12 new jsdom cases; gate green (Sonar PASSED, e2e 2/2, gitleaks).
- Review: Opus adversarial 2 rounds — Escape stole focus from the search box (fixed), two QA
  steps described impossible flows (rewritten).
- QA: `docs/testing/qa-matrix.md` § Account menu checks; report
  `docs/architecture/qa/2026-11-08-account-menu-164.md`, staging replay pending (no owner
  credentials).

## 2026-11-08 — #163 library root checked on create (PR #223 merged, `a49457d`)

- MCDA option B (owner, 410/500 vs 400 `invalid_request` 365): `POST /libraries` runs the
  scanner's `realRoot` (existing directory, real path under `MEDIA_ROOT`) → `409
  root_unreadable`, nothing stored; pure `hasControlChar` (C0, DEL, C1) refuses control
  characters in `rootPath` and `name`, create and rename, with 400. `realpath` failures now
  map to `RootUnreadableError` (409, not 500). Spec library-management R2 / 3a / 3c,
  library-scan, add sequence, component notes, ADR-0014 consequence; no new ADR.
- Tests: missing folder, file, link out, dangling link, NUL / newline / tab / DEL / C1,
  trailing slash, NFC / NFD, link inside; gate green (Sonar PASSED, e2e 2/2, gitleaks).
- Review: Opus adversarial 2 rounds — stale 400 rule in library-scan and the add sequence,
  an uncatalogued log event, unmapped `realpath` errors; all fixed.
- QA: staging owner calls not replayed (no test credentials on the staging DB); report
  `docs/architecture/qa/2026-11-08-issue-163-library-root.md`, replay pending in the matrix.
- Follow-ups: bidi / zero-width characters in names; R3 overlap not rechecked after a link
  is retargeted.

## 2026-11-08 — #177 real 404 for unknown paths (PR #221 merged, `714eaa6`)

- MCDA option A (owner, 455/500 vs Fastify serving the web 335, client view 285): both
  Caddyfiles drop `try_files {path} /index.html`; `@missing not file {path} {path}index.html`
  → `error 404`; `handle_errors 404` serves the static `404.html` (second Vite entry, token
  styles); `(popcorntv_headers)` snippet so error routes keep the security headers;
  `@rawApi` on `{http.request.orig_uri.path}` answers `404 {"error":"not_found"}`, `@assets`
  excludes raw `/api` paths. ADR-0025, spec deploy-homelab R3a.
- Tests: `scripts/not-found-check.sh` (`make check-not-found`), 27 lines, green on local
  staging; report `docs/architecture/qa/2026-11-08-issue-177-not-found.md`.
- Review: Opus adversarial 2 rounds — 404 page without headers, `/api/..%2fassets/` reaching
  the assets route, README install step missing the snippet; all fixed.
- Pi: owner copies the snippet + site block into bb-homelab on the next deploy.
- Follow-up: `pnpm lint` can exhaust the default V8 heap on this machine (reviewer note).

## 2026-11-08 — #169 Back closes the open dialog (PR #219 merged, `9592291`)

- MCDA option A (owner, 455/500 vs hash route / react-router 255): `useHistoryLayer` pushes
  a `{ pctvLayer }` entry per open `<dialog>` (detail, player, title sheet); one module
  `popstate` listener closes the layers above the landing entry top first; a button / Escape
  close goes back (pending Backs counted); "Play in my library" reuses the sheet's entry; a
  reload on a layer entry lands on the catalog. Spec `history-back`, ADR-0024, component
  diagram + state diagram 07. Known limit: a 401 with a layer open leaves its entries.
- Tests: pure helpers (TDD), hook edge cases (double Back, close then Back, reopen before
  the Back lands, Forward, hand-off), real `PlayerDialog` (save + HLS stop on Back),
  `DiscoverPage`, `App` hand-off, e2e Back / reload. Dialog `close` now async in jsdom.
  QA matrix § Back navigation checks (#169); staging replay deferred to Full QA (report
  `docs/architecture/qa/2026-11-08-issue-169-history-back.md`).
- Gate: all local checks + e2e green, SonarQube passed, adversarial review 1 Must (double
  Back lost the player's last save) + 6 Should fixed, round 2 open.

## 2026-11-08 — #179 unreachable TMDB answers 502, not 500 (PR #217 merged, `7c7af83`)

- The issue premise was stale: the body shape was already zod-guarded. The real 500s came
  from `fetch` rejecting (network, timeout, abort) and from a non-JSON body. MCDA option A
  (owner): a `reach()` helper in the TMDB client, used for API and image calls, turns them
  into `TmdbRequestError` (status `0` when unreachable, `200` for a body that is not JSON,
  original kept as `cause`). Spec R9 / 5a, ADR-0003 (Consequences amended), sequence 02.
- Tests: client (non-JSON, empty, network / timeout / abort, retry, body cut short, image,
  no stray cause), routes with the real client over a broken `fetch` (four routes 502, key
  absent from the log). QA on the local prod build with TMDB behind a closed proxy: OK
  (report `docs/architecture/qa/2026-11-08-issue-179-tmdb-unavailable.md`).
- Gate: all local checks + e2e green, SonarQube passed, adversarial review 1 Must (stale
  ADR-0003) + 3 Should fixed, round 2 open.

## 2026-11-08 — #140 continue watching waits for the last save (PR #215 merged, `6332ab9`)

- `DetailDialog` hands the player's last progress save to `onClose`; `CatalogPage` reloads
  the row once it landed (spec continue-watching R7, extension 5a known limit, sequence 06).
- Tests: delayed-save page test (red on the old code), settled save without play, stale
  answer guard. QA matrix § Continue watching checks (#140); browser replay deferred to the
  next Full QA pass (report `docs/architecture/qa/2026-11-08-issue-140-continue-watching-reload.md`).
- Gate: all local checks green, SonarQube passed, adversarial review 1 Must (stale
  diagram) fixed, round 2 open.

## 2026-11-08 — #55 copied resume reports the real HLS start (PR #211 merged, `6226e0f`)

- **Decision** — ADR-0023 (MCDA: probe before FFmpeg 465/500 vs first-segment PTS 345 vs
  re-encode 335, owner approval). A one-packet FFmpeg run with the session's own `-ss` and
  maps (`-copyts -start_at_zero … -frames:v 1 -f framecrc`) gives the earliest pts of the
  output, answered as `offsetSec`; failed probe → `startSec` + `playback.keyframe.failed`.
  `offsetSec` may be fractional (subtitle route accepts it, web floors the saved position).
- **Review** — Opus adversarial, 3 rounds: an ffprobe `-read_intervals` probe and then a
  first-video-packet probe were both one GOP off (FFmpeg's 3/23 s B-frame seek back-off,
  container start origin, audio leading the keyframe); final error 0.000 s on MKV, MP4,
  late-video MKV and MPEG-TS, −0.08 s with re-encoded audio. Gate open.
- **Gate** — 965 tests (+13 opt-in `FFMPEG_IT=1`), server 97.0 % / web 98.4 % stmts,
  SonarQube passed, gitleaks clean; Playwright smoke 1/1 run after the merge (missed
  before it). QA on the local prod build (staging holds the owner's account):
  `docs/architecture/qa/2026-11-08-issue-55-resume-offset.md`; resume checks added to
  `docs/testing/qa-matrix.md` for the later Full pass (new owner rule: every brick adds its
  QA subtleties to the ledger).
- **Follow-up** — HLS copy of AVI H.264 with B-frames fails (`first pts and dts value must
  be set`, pre-existing); `docs/architecture/README.md` ADR index stale.

## 2026-11-08 — #162 + #92 running version in the app (PR #209 merged, `283e875`)

- **Decision** — ADR-0022 (MCDA: signed-in `GET /version` 480/500 vs session field 425 vs Vite
  constant 335, owner approval). `APP_VERSION` build argument (`git describe --tags
  --always`) → `ENV`, validated by `loadConfig` (`dev` by default); `/health` answers
  `{ status }` only (#92); account menu shows `PopCornTV <version>` (UC27). `make
  staging-up` and the homelab build line pass the argument: the next Pi build must use it.
- **Gate** — 948 tests, server 97.2 % / web 98.4 % stmts, Playwright smoke 1/1, Hadolint,
  Trivy config, gitleaks, SonarQube passed; Opus adversarial 0 Must / 2 Should fixed, verify
  round open. Staging QA: `/api/version` 401 anonymous, `505b464` signed in, menu shown.
- **Follow-up** — `docs/architecture/README.md` index tables are stale (decisions, features).

## 2026-11-08 — #204 local staging instance (PR #207 merged, `6ee2daf`)

- **Decision** — owner rule 2026-11-08: no Pi redeploy per brick; QA passes run on a local
  staging instance, the owner alone decides Pi deploys. Staging on the dev machine is a
  derogation to the global "staging on the prod platform" rule (Pi build ~15 min), recorded in
  `docs/architecture/diagrams/deploy/08-deployment-staging.md`. MCDA: Caddy mirroring the Pi
  450/500 vs app + Vite dev 300 vs API only 200, owner approval.
- **Infra** — `make staging-up | staging-logs | staging-down | staging-reset`; image built from
  `git archive HEAD` (`popcorntv:staging-<sha>`), `deploy/staging/compose.yml` copies the Pi
  service behind Caddy `tls internal` on `https://localhost:8443`, network `10.203.204.0/24`
  (Docker's 172.x pools are all taken on the dev machine), `.env.staging` gitignored. The image
  now creates `/app/cache` (uid 1000) for fresh named volumes; Caddy needs `NET_BIND_SERVICE`
  back under `cap_drop: ALL`. Spec deploy-homelab §2: QA on staging first, smoke on the Pi.
- **Gate** — staging healthy from a clean HEAD, Hadolint, Trivy config, Prettier, lint,
  gitleaks, SonarQube passed; Opus adversarial (2 Must + 4 Should fixed), verify round open
  (1 Should fixed). Codex review: out of credit.

## 2026-11-08 — #182 logging audit (PR #205 merged, `eae975a`)

- **Audit** — 18 log calls in 9 server files, `LOG_LEVEL` ignored, audit events in the
  database only, swallowed TMDB / unreadable-root branches.
- **Conception** — spec `docs/architecture/specs/logging.md` (R1–R8, event catalog, sink),
  ADR-0021 (MCDA: `auth_events` mirrored into the log by `EventRepository.record`, 490/500,
  owner approval), "Log events" sections in four feature specs, log sink on the deployment
  diagram.
- **Code** — `LOG_LEVEL` validated, pino redact, one `http.request` line per answer through a
  `OneLinePerRequest` log controller (keeps Fastify's error lines), `event` on every domain
  line (scan, TMDB, playback decision, session lifecycle with close reason, CSRF, auth),
  `scripts/log-coverage.mjs` in `pnpm lint`.
- **Gate** — typecheck, lint + log coverage, format, 622 server tests, coverage 97.2 %, build,
  gitleaks, SonarQube passed; Opus adversarial (1 Must + 9 Should fixed), verify round open
  (2 Should fixed). Merge with main resolved a conflict with #180 in `viaTmdb`; the #178 guard
  test now expects the `discover.tmdb.failed` line. Codex review: out of credit.

## 2026-11-08 — Pi deploy of `0698684`, FULL QA pass, #178 fix (PR #180 merged, `9d21ab0`)

- **Deploy** — Pi rebuilt from `0698684` (was `bbde01d`), backup taken first, healthy; Discover
  works with the real TMDB key.
- **QA full** — report `docs/architecture/qa/2026-11-08-full-pass-pi.md`, first coverage ledger
  `docs/testing/qa-matrix.md` (25 flows). No Must; issues #163–#177 (5 Should, 10 Nice), #55
  re-observed. Not covered: SEC rows, 320/390 px, offline, viewer role, multi-audio, series.
- **Server logs** — three TypeErrors on Discover TMDB error paths → #178 fixed in PR #180
  (`viaTmdb` returns a `SENT` sentinel, a thenable reply resolved to `undefined`); Opus
  adversarial + verify, gate open, SonarQube passed. #179 filed (malformed TMDB body → 500).
- **Backlog** — #160 end-of-film / ratings / favourites / recommendations, #161 brainstorming,
  #162 show the running version.

## 2026-11-08 — end-of-run review of #127 and #136 (PR #158 merged, `77a1f0a`)

- **Review** — Opus adversarial over #127 and #136 (17 findings, table in
  `docs/architecture/review-local.md`). Fixed: Discover posters served only for paths the server
  handed out (allowlist, max 2000), TMDB 404 → `404 title_not_found`, private immutable poster
  cache, audio choice kept at track 0 (direct play) until the viewer picks one, Discover →
  "Play in my library" resets the tab, `maxLength` on the search, UML and doc deltas.
  Disagreed: keep the poster route in the `MEDIA_ROUTE` bucket.
- **Checks** — full local CI green: typecheck, lint, format, tests (shared 45, server 599,
  web 268), coverage (shared 100 % — was 75 % since #136 —, server 98.48 %, web 98.56 %),
  build, gitleaks, E2E smoke, SonarQube gate passed (S7721, S2004, S1874 fixed).
- **Follow-ups** — #156 Discover caches and limits, #157 audio and identity polish.
- **Decision** — `tmdb-key`: one TMDB key shared by staging and prod (owner, 2026-11-08); the
  serial client and memoised lists stay far below TMDB's ~50 req/s per IP.

## 2026-11-08 — #127 discover TMDB titles and wishlist (PR #154 merged, `50c704b`)

- **Conception** — spec `discover-wishlist.md` (UC26, catalog use case + component deltas),
  ADR-0020 (MCDA A 450 / B 400 / C 200): Discover goes through the server's TMDB client, posters
  lazily cached at `w342`, wishlist in its own table, availability joined on `media.tmdb_id`.
  Merge of #127 Discover and the #128 idea (owner brainstorm 2026-11-07); no Seerr / Radarr /
  Sonarr call, no download, no playback of titles not on disk; #128 stays open.
- **Change** — TMDB client `list` / `searchTitles`; `src/discover/` routes (lists memoised
  15 min, search, title sheet, poster route) and `wishlist` table (migration `0008_wishlist`,
  FK cascade); web Library / Discover tabs, My list + four TMDB rows, search, title sheet
  with wishlist toggle and "Play in my library".
- **Checks** — typecheck, lint, format, tests green (shared 39, server 592, web 265). Full
  local CI, E2E, SonarQube and the Opus verify round deferred to the end-of-run pass.

## 2026-11-07 — #136 choose the audio track (PR #152 merged, `adfd4c0`)

- **Conception** — spec `audio-track.md` (UC25), ADR-0019: index 0 plays directly, any other
  track goes through HLS with `-map 0:a:N`; an index past the last track falls back to 0.
- **Change** — pure `audioTracks` / `effectiveAudioIndex` / `matchAudioTrack` in
  `packages/shared`, `audioIndex` 0–99 on `POST /playback/sessions`, Audio select in
  `DetailDialog`, matched by language on each played episode (Next episode included).
- **Stack review** — Opus adversarial over #134–#136 (Must 2, Should 7): fixed the stale
  FFmpeg docblock, ADR-0018 identity wording and its sensitivity tie (400/400), UML deltas
  (`identity`, `SearchBox`, `audioIndex` in the resume sequence), a persistent search live
  region, `CLAUDE.md` state. Verify round, full local CI, E2E and SonarQube deferred to the end
  of the feature run at the owner's request (2026-11-07).

## 2026-11-07 — #135 search titles and people (PR #150 merged, `9be4696`)

- **Conception** — spec `search.md` (UC24, catalog use cases): client-side search over the
  loaded catalog like the rows (ADR-0015); case and accents folded; a title matches on its
  name or a cast name (TMDB stores no crew); title matches first, then person matches, A–Z.
- **Change** — pure `searchItems` in `catalog.ts`, `SearchBox` (`<search>`, Escape clears),
  results grid replaces hero, controls and rows; result count announced to screen readers.
- **Gate** — coverage server 97.5 % / web 99 %, SonarQube PASSED (after removing a duplicate
  `.visually-hidden` selector), gitleaks clean, E2E smoke green; Sonnet combined review
  (Must 0, 3 Should fixed, 2 answered). Opus adversarial review deferred to the end of the
  #134–#136 stack. Report `docs/architecture/review-local.md`.

## 2026-11-07 — #134 progress carry-over at scan (PR #148 merged, `9849002`)

- **Conception** — spec `progress-carry-over.md` (UC1 extension, UC6), ADR-0018: before missing
  rows are pruned, their `watch_progress` moves to the one present file of the same title
  (episode by series / season / episode, else title + year + part or TMDB id + part); an
  ambiguous match carries nothing; newer position wins, a watched mark is kept.
- **Change** — pure `library/identity` (`identityKeys`, `carryOverTargets`), carry-over in the
  repository's prune transaction, skipped when nothing is missing; no migration.
- **Gate** — coverage server 97.5 % / web 99 %, SonarQube PASSED, gitleaks clean, E2E smoke
  green; Sonnet combined review (Must 0, 6 Should fixed or recorded in R3 / R4). Opus
  adversarial review deferred to the end of the #134–#136 stack. Report
  `docs/architecture/review-local.md`.

## 2026-11-07 — #133 watched marks (PR #146 merged, `17f5d97`)

- **Conception** — spec `watched-marks.md` (UC23), ADR-0017: nullable `watch_progress.watched_at`
  (MCDA A 465 vs 330 / 345); `finished` = mark or ≥ 90 %; a rewatch keeps the mark; unwatched
  forgets the row; a series mark applies to each episode.
- **Change** — `PUT | DELETE /profiles/:profileId/media/:id/watched` in one transaction,
  migration 0007, detail-dialog toggle, poster ✓ via `WatchedContext`, per-episode label.
- **Gate** — server 567 / web 246 tests, SonarQube PASSED, gitleaks clean, E2E smoke green;
  Sonnet combined review (5 Should fixed) and Opus adversarial 2 rounds (1 Must: finished rule
  stated two ways, 6 Should fixed), gate open on `b20f75b`. Report
  `docs/architecture/review-local.md`.
- **Decision** — owner 2026-11-07: for the rest of the stack (#134–#136) the adversarial
  review runs once at the end.

## 2026-11-07 — #132 scheduled library scan (PR #143 merged, `5f43064`)

- **Conception** — spec `scheduled-scan.md`, ADR-0016: `SCAN_INTERVAL_MIN` (default 60, `0`
  off), an in-process unref-ed timer runs the route's `scanLibrary` on each library in turn,
  a busy library is skipped, runs never overlap, the timer is stopped and awaited in
  `preClose`.
- **Follow-ups** — #144 (pin the FFmpeg kill before the scheduled-scan wait on close).

## 2026-11-07 — #131 continue-watching row (PR #141 merged, `3a61d0f`)

- **Conception** — spec `continue-watching.md` (UC22), sequence `catalog/06`, ADR-0015: the
  row is joined in the browser from `GET /profiles/:profileId/progress` and the loaded catalog
  (MCDA A 485 vs new route 290, enriched `/progress` 345). No server change.
- **Change** — pure `continueWatchingRow`: resumable titles, one card per series decided by
  its latest episode, next episode after a finished one, a barely started episode defers to
  an older one, newest first, max 20; first row of the home view; reloaded when the detail
  dialog closes; native `<progress>` (no inline style) and "N% watched" in the card name.
- **Gate** — web 235 tests 99 % stmts, SonarQube PASSED after splitting the function
  (cognitive complexity), gitleaks clean, adversarial review 3 rounds (3 Must fixed: UC9 id
  collision, inline style, stale catalog-grid step). No E2E run. Merged with
  `MERGE_GATE_WAIVER` (Actions disabled), owner yes in chat.
- **Follow-ups** — #140 (reload after the player's last save).

## 2026-11-07 — #62 Plex / Jellyfin parity matrix

- **Change** — `docs/requirements/03-plex-jellyfin-parity.md`: 18 features, 16 gaps scored by MCDA
  (value 40, effort 25, cut-over need 25, risk 10).
- **Decision** — owner chose option A, file items 1–8 (440), over B, items 1–6 without
  backup and history import (420), and C, items 1–4 only (380): #131–#138 on Project #71.
- **Correction** — the adversarial review found items 7 and 8 already settled (backup by
  ADR-0013 §4, no Jellyfin history per #125) and D1–D4 void for bb-homelab: #137 and #138
  filed in error, `.srt` sidecars re-scored as a gap (250).

## 2026-11-07 — #123 library management from the web app, with #122 (PR #129 merged, `91b4c4f`)

- **Conception** — brainstorm against Plex, Jellyfin and Netflix; spec
  `library-management.md` (UC21), ADR-0014 (four MCDA choices: sub-folders of `MEDIA_ROOT`
  plus a typed path, synchronous scan, delete in scope, empty-catalog welcome), UML under
  `diagrams/library/`.
- **Change** — owner routes `GET /libraries/folders`, `PATCH|DELETE /libraries/:id`; roots
  overlapping on real paths refused `409 root_in_use`; delete under the library lock (DB
  cascade, files untouched); web `LibrarySection` in Administration and "Add a library" on the
  empty catalog. #122: an empty JSON body is no body on every route; deploy guide step 6.
- **Correction** — ADR-0014 §1 totals were miscomputed when first shown (B led at 410); the
  owner re-decided on true totals with effort re-scored once C was written (C 415).
- **Gate** — 800 tests, server 97.4 % / web 98 % stmts, SonarQube PASSED (new coverage
  95 %), gitleaks clean, Playwright smoke 1/1, adversarial review 4 rounds (3 Must fixed),
  Codex quota refused. Merged with `MERGE_GATE_WAIVER` (Actions disabled, no doc-coverage
  counter) on the owner's yes.
- **Gotcha** — `sonar-scanner` defaults to SonarCloud here: pass
  `-Dsonar.host.url=http://localhost:9000` and run it from the repo root after
  `pnpm coverage`.
- **Follow-ups** — #127 Discover TMDB titles, #128 request through Seerr (owner configures
  everything behind Seerr; no content source in PopCornTV); scheduled scan and background
  scan progress to file when needed.

## 2026-11-07 — #60 deployed and verified on bb-homelab

- **Deploy** — image `popcorntv:8d3546d` built on the Pi; app and Caddy healthy; TMDB read
  token set by the owner (never seen by the agent); owner account created from the one-time
  setup link; libraries `Films` and `Séries` created under `/app/media` and scanned.
- **QA on the Pi** (Chrome over the tailnet) — TMDB match in French, catalog rows, direct
  play MP4, HLS of a HEVC/AC-3 test MKV (made on the Pi), embedded French subtitles, resume
  from 0:39 with subtitles shifted (`offsetSec=39`), CSP/HSTS/XFO headers. Test clip removed.
- **Ops** — Uptime Kuma HTTP monitor `PopCornTV` on `/api/health` (up); Push monitor
  `backup-popcorntv` (new token) and cron 03:25; first backup ran, 8 KB archive, heartbeat
  received.
- **Correction** — the homelab inventory of #26 was a colleague's stack; the owner's
  dashboard lists n8n, Jellyfin, Vaultwarden, Uptime Kuma; Jellyfin is the only media service.
  Owner decision: no Maintainerr (not installed 500, later 455, now 45); spec
  `deploy-homelab` §2 step 3 and `02-homelab-ecosystem.md` amended, D1–D4 void for bb-homelab.
- **Found** — `POST /libraries/:id/scan` answers 400 `FST_ERR_CTP_EMPTY_JSON_BODY` when sent
  `Content-Type: application/json` with an empty body (Fastify default; send `{}`); no
  library UI yet; no video fit/fill control. Jellyfin removal due 2026-11-21. Issues #122
  (scan body), #123 (library UI), #124 (fit/fill), #125 (watch history import); bb-homelab
  #245 (Jellyfin removal), #246 (dashboard tile).

## 2026-11-07 — #60 homelab deployment replacing Jellyfin, with #46 headers (PR #120 merged, `8d3546d`)

- **Change** — the image also builds and ships `apps/web` (`/app/web`). `deploy/homelab/`
  holds the reference compose (external `bb-homelab-proxy-popcorntv` 10.203.60.0/29,
  `TRUST_PROXY` 10.203.60.2, read-only, `cap_drop: ALL`, binds with `create_host_path:
  false`, caches in `/app/cache` out of the backup, one-shot `web-sync` copying the web build
  into the `popcorntv-web` volume), the Caddy block (`tailnet_only`, CSP, HSTS, XFO, COOP,
  Permissions-Policy, immutable `/assets`, no SPA fallback there) and the deploy guide.
  ADR-0013, `diagrams/deploy/08-deployment-prod.md`, spec `deploy-homelab.md`. The live
  config is bb-homelab #240 (PR #242 `a8ec3a7`, log #244).
- **Decisions** (owner MCDA) — exposure through the bb-homelab Caddy 410 vs Tailscale
  Serve 390 vs own Caddy 240; live config in bb-homelab 440 vs all in popcorntv 290; web
  build in the image + volume 450 vs rsync 395 vs Fastify static 305; backup by
  `appdata-backup.sh` 500; media moved to `/mnt/appdata/media` 410 (interim until
  `/mnt/media`, bb-homelab #47); Jellyfin removed two weeks after cut-over 420. Jellyfin was
  home-only and already stopped. Maintainerr audit placed before the household switch.
- **Reviews** — adversarial (Opus) 3 rounds: 7 Must fixed (tailnet guard, external
  network and volume, XFO + COOP, backup path, Kuma alias, tailnet-only wording,
  Maintainerr order), then 0 Must. bb-homelab session caught a GNU `find -exec` order bug in
  `web-sync` (fixed `7564a28`). Codex: usage limit, no review.
- **Gate** — typecheck, lint, format, coverage, build, smoke 1/1, SonarQube PASSED,
  Hadolint, Trivy config + image, gitleaks clean; local stack behind caddy:2.11.8 passed a
  Playwright run (setup, scan, direct play MP4, HLS HEVC/AC-3) with zero CSP violations.
  **Waiver**: GitHub Actions is disabled on the repo, so no CI ran; owner approved the merge
  on the local gate. Pi deployment and QA on the Pi follow the merge.

## 2026-11-07 — #110 runtime image off the unfixed Debian 12 FFmpeg stack (PR #117 merged, `af69563`)

- **Change** — both Dockerfile stages on `node:22.23.4-trixie-slim` (tag + digest); `ffmpeg`
  / `ffprobe` copied from the static upstream build `mwader/static-ffmpeg:9.0.2-1` (tag +
  digest) with a build-time version check. `make scan-docker-image` drops
  `--ignore-unfixed` (audit SA-03): the 13 remaining unfixed HIGH CVEs (util-linux, systemd,
  ncurses, sqlite, zlib, perl, libacl) are waived in `.trivyignore.yaml` by `purls`
  (OS packages have no path), expiry 2027-02-07, re-check #116. `SECURITY.md` documents the
  static FFmpeg blind spot (its ~50 bundled libraries are invisible to Trivy).
- **Decision** — MCDA measured with Trivy 0.76.0 on throwaway images (HIGH/CRITICAL,
  distinct CVEs, npm excluded): Debian 12 + its FFmpeg 7 C / 68 H (18 FFmpeg); A Debian 13
  + its FFmpeg 1 C / 53 H (17 FFmpeg, unfixed by Debian); **B Debian 13 + static FFmpeg**
  0 C / 13 H, 489 MB; C distroless + static 0 C / 2 H. Scores B 360, A 350, C 300 (sensitive
  to the Trivy-visibility weight). Dropping `--ignore-unfixed`: option A 445 vs a separate
  report-only scan 335 vs status quo 300.
- **Reviews** — adversarial (Opus) 2 rounds: 1 Must fixed (waivers inert while the scan
  kept `--ignore-unfixed`), 3 Should fixed or tracked in #116 (static library blind spot,
  Dependabot and the 4-part `9.0.2-1` tag, decision record). docker-auditor: one Must, a
  follow-up issue per waiver (#116). Codex: no finding. Follow-up #118
  (`-protocol_whitelist` on FFmpeg / ffprobe calls).
- **Gate** — 38 shared + 521 server + 199 web tests, server coverage 97.5 %, SonarQube
  PASSED, smoke 1/1, Hadolint, `docker build --check`, Trivy config and image clean,
  gitleaks clean, CI green. In the container: healthy, UID 1000, CapEff 0, HLS transcode
  (libx264 + aac, `-ss`) and WebVTT extraction checked with the app's own argument builders.

## 2026-11-06 — #109 security audit before the homelab exposure (PR #113 merged, `11a5b4a`)

- **Change** — report `docs/security/reports/2026-11-06-security-audit.md` (audited commit
  `30a3b86`): white-box review (OWASP Top 10:2025, ASVS 5.0) of server, web, container and
  CI, plus pentest-kit cards SECRETS, CONTAINER and WEB-APP on a local production image;
  loopback-only `docs/security/scope.yaml`, gitignored.
- **Decision** — method B (review + cards on a local prod build) 445 vs review only 370 vs
  full campaign with the homelab 250 (MCDA); exposure and machine cards run after #60.
- **Findings** — no Critical or High in the code. SA-03 #110 (High, Must before #60:
  Debian 12 FFmpeg 5.1 stack with unfixed Critical/High CVEs hidden by `--ignore-unfixed`),
  SA-01 #111 (Should, local `make sast`), SA-02 #112 (Nice, compose hardening), SA-04 #114
  (Nice, path swap window between the check and the reopening). #46 goes into #60; #86,
  #87, #89 Should; the other open security issues Nice.
- **Reviews** — adversarial (Opus) 3 rounds: 3 Must fixed (branch predated #74, Semgrep
  claim, SA-01 rule misstated). Codex: 1 P2 fixed (O_NOFOLLOW claim, became SA-04).
- **Gate** — 38 shared + 521 server + 199 web tests, server coverage 97.5 %, SonarQube
  PASSED, smoke 1/1, Hadolint and Trivy config clean, gitleaks clean, CI green.

## 2026-11-06 — #74 transcode slot take-over (PR #107 merged, `37832ec`)

- **Change** — at `TRANSCODE_MAX_SESSIONS` a Play takes over the caller's own oldest HLS
  session, else for an owner the oldest viewer one, else `503 transcode_busy`; never
  another owner's. A title without video answers 422 before any take-over; a session taken
  over while starting answers 502. Take-overs logged at `info`. Spec hls-transcode R5b,
  ADR-0012 (amends ADR-0006 §6), playback UML 02/05.
- **Decision** — own + owner-first 440 vs owner-first 425 vs per-account limit 400 vs own
  slot 375 (MCDA; totals first given wrong in chat, corrected in review).
- **Reviews** — adversarial (Opus) 4 rounds: 5 Must (docs drift, MCDA arithmetic) and the
  no-video take-over fixed. Codex: 1 P2 fixed (playlist check racing a take-over).
- **Gate** — 38 shared + 521 server + 199 web tests, server coverage 97.5 %, SonarQube
  PASSED, smoke 1/1, gitleaks clean, CI green.

## 2026-11-06 — #72 global HTTP rate limit (PR #104 merged, `da5fe1f`)

- **Change** — `@fastify/rate-limit` 10.3 as the first root `onRequest` hook (before the
  auth hook), keyed `api:` / `media:` + `clientKey(request.ip)` (IPv6 by /64): 300 / min
  per client on the API, 3000 / min on `MEDIA_ROUTE` routes (segments, ranges, subtitles,
  artwork, heartbeat, health). `429 too_many_requests` + `Retry-After`, no `x-ratelimit-*`
  on ordinary answers, web message added. `buildApp` is async. Spec auth R13, ADR-0011,
  auth UML 02/03.
- **Decision** — plugin 410 vs own limiter 290 vs Caddy only 250 (MCDA). Review turned the
  approved media exemption into a separate bucket: the exemption let forged-cookie floods
  through uncounted.
- **Reviews** — adversarial (Opus) 2 rounds: 2 Must fixed (no IPv6 /64 grouping although
  documented, unauthenticated media flood). Codex: no finding. CodeQL: no open alert.
- **Gate** — 38 shared + 513 server + 199 web tests, server coverage 97.6 %, SonarQube
  PASSED, smoke 1/1, gitleaks clean, CI green.
- **Follow-ups** — #105 shared `buildApp` test fixture.

## 2026-11-06 — #47 dev proxy target from `API_URL` (PR #101 merged, `5d6cf09`)

- **Change** — `apps/web/vite.config.ts` proxies `/api` to `process.env['API_URL'] ||
  'http://localhost:3000'` (`||` so an empty value falls back); documented in `CLAUDE.md`,
  `README.md`, `.env.example` (keep its port in step with `PORT`). No test (KISS).
- **Decision** — read from the shell like every server setting, not `loadEnv` (MCDA 500/500
  vs 300/500): nothing in the project loads `.env.local`. Codex raised the same point on
  #101; answered Disagree, filed as #102.
- **Reviews** — adversarial (Opus) 2 rounds: 3 Should fixed (empty value 502, remote-host
  example, `PORT` drift). Codex: 1 P2, Disagree.
- **Gate** — 38 shared + 497 server + 198 web tests, SonarQube PASSED, smoke 1/1, CI green.
- **Follow-ups** — #102 `.env.local` loading, empty `PORT`, untyped Vite config.

## 2026-11-06 — #45 prod advisories and #96 node base (PRs #97 `3f012ab`, #99 `bb3d4bc`)

- **Decision** — homelab roadmap, option D (MCDA 415/500 against A all-first 380, corrected
  C 345, B LAN-now 335): exactly the #60 prerequisites in order, #45 → #47 → #72 → #74 →
  full security audit (issue to file), then #60 with #46 (CSP, HSTS) as its first step in
  the Caddy config; the #18 R12 Nice findings (#86–#93) after the cut-over, Jellyfin kept
  as fallback until it is validated. Open question for #60: is Jellyfin used remotely?
- **Changes** — #45: `@fastify/static` `^10.1.9` resolves `glob` 14.0.3 and `minimatch`
  11.0.4; `pnpm audit --prod` clean (was GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249). #96:
  both stages on `node:22.23.4-bookworm-slim` (apt 2.6.2, CVE-2026-109518); the
  `apt-get upgrade` stays, its comment now says keep and re-check on each base bump.
- **Lesson** — #96 was filed on a stale cached image: CI was green because cold runners
  re-run `apt-get upgrade`. The adversarial review caught it; the #38 rule stands, rebuild
  `--no-cache` before any local image scan.
- **Reviews** — adversarial (Opus): #45 1 round, open; #96 2 rounds, 2 Should fixed. Codex
  on both: no finding.
- **Gate** — 38 shared + 497 server + 198 web tests, SonarQube PASSED, smoke 1/1, Trivy
  image clean, CI green on both heads (#97 re-gated after its rebase on #99).
- **Follow-ups** — #98 dev-only advisories (`typescript-eslint` minimatch, `drizzle-kit`
  esbuild); Dependabot ignore for Node majors (#50) and a `--no-cache` image build target
  not filed yet.

## 2026-11-06 — #18 R12 closing gate: QA pass and security review (PR #94 merged, `258bfcb`)

- **Changes** — QA pass `docs/architecture/qa/2026-11-06-auth.md` on a production-like
  stack (prod image behind Caddy `tls internal`, spec §5): SEC-02…12 and SEC-15 pass,
  SEC-01 fails on headers. Security review `docs/architecture/qa/2026-11-06-auth-security-review.md` (Opus):
  1 Must, 3 Should, 5 Nice. Fixes: demoting or deleting an owner revokes every pending
  link (a deleted owner could take another owner's account back), a password change
  revokes the pending reset, `TRUST_PROXY` is now the proxy's address list (`1` / `true`
  refuse to start; supersedes the "trusts one hop" of lot 1), `username_tried` only names
  an existing account, API answers default to `Cache-Control: no-store`.
- **Decisions** — QA target: prod image + Caddy container (MCDA 440/500 against plain HTTP
  295); revoke all pending links on owner loss, no `issued_by` column (440 against 420);
  `TRUST_PROXY` as addresses (430 against 330 / 275). Re-check: trusting the whole Docker
  network CIDR lets a sibling container forge `X-Forwarded-For`; docs say Caddy's fixed
  address.
- **Reviews** — 2 adversarial rounds (round 1: 1 Must, stale diagram note; round 2 gate
  open); Codex review started, no finding before merge.
- **Gate** on `d34c8b1` — 38 shared + 497 server + 198 web tests, coverage server 98.6 % /
  web 99.4 % lines, SonarQube PASSED, gitleaks clean, smoke 1/1, CI green. #18 closed.
- **Follow-ups** — #86–#93 (rotate on revoked session, token in URL, eager dummy hash, IP
  log retention, `reset_revoked` events, 404/431 body, `/health` version, artwork
  `private`); web-build headers on #46, limiter map growth on #72.

## 2026-11-06 — #73 accounts lot 2: invitations, resets, administration (PR #77 merged, `c1a62fd`)

- **Changes** — `token-repository`: single-use invitation (72 h) and reset (24 h) links,
  SHA-256 stored, redeemed by `POST /auth/redeem` (a reset ends every session and lifts the
  lockout); owner `user-routes`: accounts with live device counts, role change, deletion,
  per-device and global sign-out, reset and invitation links, `GET /auth/events`; last
  owner protected (`409 last_owner`); a token that is not pending is counted without
  hashing; the hook tries up to four session cookies; web `RedeemForm` and `AdminPanel`.
- **Decisions** — one PR for the whole lot (MCDA 430/500); `Refs #18`, not `Closes`
  (450/500): spec R12 needs the QA pass and the security review before #18 closes.
- **Reviews** — 5 adversarial rounds (Opus): round 1 2 Must (owner self-delete answered
  500, stale layout), then gate open with Should fixes each round; Codex: 2 P2 (stale admin
  state after a role change or a self-demotion) fixed; SonarQube: 7 issues fixed.
- **Gate** on `bd98e84` — 38 shared + 470 server + 198 web tests, coverage server 97.5 % /
  web ~98.9 % lines, SonarQube PASSED, gitleaks clean, Playwright smoke 1/1, CI green.
- **Follow-ups** — ESLint ignore for `.claude/**`; links ignoring a `PUBLIC_URL` path
  prefix; per-token attempt cap; `hashchange` handling; "this device" flag; self-demotion
  confirmation; actor column in the event list.

## 2026-11-05 — #26 homelab ecosystem triage (PR #69 merged, `5fb5eb9`)

- **Changes** — `docs/requirements/02-homelab-ecosystem.md`: inventory of the media
  services, the media chain, a per-tool triage and four MCDA matrices.
- **Decisions** — the 2026-10-23 coexistence rule stands: PopCornTV replaces Jellyfin only,
  Plex stays as backend of Seerr, Maintainerr and Tunarr (D2 460), a child viewer's
  wishlist stays in Seerr with a link from the UI (D1 440 against 280 for calling the
  Radarr / Sonarr API), Bazarr sidecars get muxed by a Tdarr flow (D3 440), Tdarr remuxes
  to MP4 so most files direct-play (D4 445). No integration brick.
- **Reviews** — a first plan that called Radarr / Sonarr was rejected by an adversarial
  review (6 Must, among them: it reversed the recorded decision, assumed Plex was going,
  needed an unscoped admin key and a second HTTP egress). A second round on the document
  caught wrong MCDA totals, a false direct-play claim (only `mp4` / `m4v` / `webm`
  direct-play) and the manual-only scan every decision depends on.
- **Follow-ups posted** — #62: resume progress survives a file replaced on
  another path; #60: Uptime Kuma probe, Tdarr and Bazarr flows, Maintainerr rule audit,
  Jellyfin history import. To file after #18: the Seerr link and a scheduled library scan.

## 2026-11-05 — #18 accounts and sessions, lot 1 (PR #70 merged, `b82913d`)

- **Changes** — migration 0006 (`users`, `sessions`, `auth_tokens`, `auth_events`,
  `profiles.user_id`, `ADD COLUMN` so `watch_progress` survives); opaque session cookie
  stored as SHA-256 (idle 14 d, absolute 90 d, cap 20, rotation); argon2id behind a 4-slot
  semaphore; in-memory limiter (attempt counted before hashing, busy refunded, IPv6 by /64);
  one-time setup link; access hook with `config.access` and the `Origin` /
  `Sec-Fetch-Site` CSRF check; profiles, progress and playback sessions per user; web
  setup, sign-in and account menu. `PUBLIC_URL` required, `TRUST_PROXY=1` trusts one hop.
- **Decisions** — owner chose lot 1 = core (MCDA 475/500); CodeQL
  `js/missing-rate-limiting` alerts 16–18 dismissed as false positives (410/500), global
  limit tracked in #72; Copilot and Codex reviews dropped for lack of credit, the local
  gate is the reference.
- **Reviews** — 3 adversarial rounds (Opus): round 1 2 Must + 3 Should, round 2 1 Must +
  1 Should, round 3 gate open; Codex: 3 findings fixed; SonarQube: 17 smells fixed.
- **Gate** on `644cfef` — 38 shared + 435 server + 157 web tests, coverage server 98 % /
  web 99 %, smoke 1/1 on the prod build, SonarQube PASSED, gitleaks clean, CI green.
  Squash-merged with owner approval.
- **Follow-ups filed** — #72 global rate limit, #73 lot 2 (invitations, resets,
  administration, events, carried-over review nits), #74 per-account transcode slot.

## 2026-11-05 — #18 accounts and remote access, design (PR #64 merged, `9f0fcf2`)

- **Changes** — design only: spec `docs/architecture/specs/auth.md` (UC11–UC20, R1–R12),
  ADR-0010, 7 diagrams under `docs/architecture/diagrams/auth/`; ADR-0008 §4 superseded and
  the profiles spec and sequence scoped per user. #18 stays open for the implementation.
- **Decisions** — ADR-0010: invitation links (440/500), server-side sessions with an opaque
  SHA-256-stored token (475), CSRF by `SameSite=Lax` plus an `Origin` / `Sec-Fetch-Site`
  check (460), first owner by a one-time setup token (420), profiles owned by users (430).
  Email/SMTP and TOTP split out of #18.
- **Reviews** — 5 adversarial rounds (last with 0 finding) and an architecture review, all
  applied; Codex found no issue.
- **Gate** on `c50aa0f` (main merged in) — 31 shared + 334 server + 129 web tests, smoke 1/1,
  SonarQube PASSED, gitleaks clean, CI green. Squash-merged with owner approval.
- **Follow-ups filed** — #58 email, #59 TOTP, #60 homelab deploy, #61 README index, #62
  Jellyfin parity, #63 conception coherence.

## 2026-11-05 — #65 smoke mocks the profiles API (PR #66 merged, `e3ea142`)

- **Changes** — the Playwright catalog smoke had been red since #10, because `/api/profiles`
  was not mocked; the pre-merge gate of #64 caught it. The smoke now mocks the profile
  picker and its progress load. A catch-all `route.abort()` fails any unmocked API call
  fast, the fixtures are typed with `satisfies` through type-only shared imports (a runtime
  import resolves to the gitignored `dist`), and the profile button is matched with
  `exact: true`.
- **Decisions** — owner chose a dedicated PR before the #18 design merge (MCDA 440/500).
- **Reviews** — 3 adversarial rounds (the round-2 Must, a runtime shared import, was
  fixed); Codex found no issue.
- **Gate** on `d58a315` — 31 shared + 334 server + 129 web tests, smoke 1/1, coverage server
  98.4 % / web 100 % lines, SonarQube PASSED, gitleaks clean, CI green. Squash-merged with
  owner approval.
- **Follow-up filed** — #67 run the Playwright smoke in CI.

## 2026-11-03 — #24 subtitles as WebVTT tracks (PR #56 merged, `ac687d7`)

- **Changes** — `GET /media/:id/subtitles/:index?offsetSec=` serves an embedded text subtitle
  stream as `text/vtt`; pure `subtitleTracks` (shared) numbers tracks by subtitle ordinal
  (`-map 0:s:N`); `SubtitleExtractor` caches the unshifted WebVTT under
  `TRANSCODE_DIR/subtitles/<media>-<index>-<mtime>.vtt`; pure `shiftWebVtt` aligns cues with a
  resumed HLS timeline; the player adds one `<track>` per offered track (S4084 cleared).
- **Decisions** — ADR-0009: embedded text tracks only (MCDA 460 vs 340 both, 285 sidecars),
  on-demand extraction + cache (425 vs 350 no cache, 300 at scan), server-side cue shift
  (470 vs 375 web shift).
- **Reviews** — local review Must 0, 7 Should fixed in `770ffcd` (two runs at most, runs
  killed in `preClose` per #28, timeout settles on exit, stale mtimes removed, `ENOENT`-only
  cache miss, `subtitleUrl`, docs aligned, tests). Codex review unavailable (quota).
- **Gate** on `770ffcd` — 31 shared + 334 server + 129 web tests, coverage server 98.4 % /
  web 100 % lines, SonarQube PASSED, gitleaks clean, CI 6/6, QA with real FFmpeg in direct
  play and resumed HLS (`docs/architecture/qa/2026-11-03-subtitles.md`). Squash-merged with
  owner approval.
- **Follow-up filed** — #55 resumed H.264-copy sessions start one GOP early (cues and saved
  position may run early).

## 2026-11-03 — #28 reap FFmpeg on a crash (PR #53 merged, `b0ec9d4`)

- **Changes** — `installShutdownHandlers` closes the app on SIGINT/SIGTERM (exit 0) and on
  `uncaughtException` / `unhandledRejection` (logged, exit 1); first event wins, exit forced
  after 10 s. Sessions close in `preClose`, before Fastify drains open responses.
- **Decision** — `tini` as the image `ENTRYPOINT` rather than compose `init: true`, so every
  launcher gets a reaping PID 1 (MCDA A 420 vs 345). Free-disk check dropped (HLS sessions
  live in memory); attached pictures were already skipped since #8.
- **Reviews** — local review Must: `close()` waited for open direct-play streams, delaying the
  FFmpeg kill for a whole film; fixed with `preClose` + deadline. Known limit: `kill -9` on
  Node outside a container still orphans FFmpeg.
- **Gate** on `5fa1ae9` — 451 tests, server coverage 98.1 %, SonarQube PASSED, gitleaks clean,
  Hadolint + Trivy green, image PID 1 `tini`, CI 9/9. Codex review unavailable (quota).
  Squash-merged with owner approval.

## 2026-11-02 — #38 Docker conformance (PR #49 merged, `27dee37`)

- **Changes** — both `node:22.21.1-bookworm-slim` stages pinned by tag + digest; Dockerfile
  frontend pinned to `1.28` with `# check=error=true`; DL3005 `apt-get upgrade` gets a
  re-check note per base bump; Dependabot docker updates grouped (`patterns: ['*']`) so
  digest-only refreshes arrive.
- **Decision** — no BuildKit cache mounts / buildx `gha` cache: the CI image job takes
  ~2 min (MCDA option A 450/500 vs 335 cache mounts, 270 cache + gha).
- **Gotcha** — with a digest-pinned base, a local rebuild reuses the cached `apt-get upgrade`
  layer and misses new Debian fixes (Trivy flagged 2 fixed CVEs); rebuild `--no-cache`
  before a local image scan. CI runners start cold.
- **Gate** on `58c1232` — 444 tests, SonarQube PASSED, gitleaks clean, Hadolint + Trivy
  config/image green, `/health` 200 as uid 1000, CI 9/9. Codex review unavailable (quota).
  Squash-merged with owner approval.

## 2026-11-02 — #31 security headers (PR #44 merged, `1121fb1`)

- **Goal restated** — PopCornTV is to replace the Jellyfin of the owner's homelab; next
  bricks are ranked by what closes that gap (#31, #38, #28, #24, #18, homelab deployment).
- **Implementation** — an `onSend` hook adds `nosniff`, `Referrer-Policy: no-referrer` and
  `Cross-Origin-Resource-Policy: same-origin` to every reply (errors, 206 media, HLS,
  artwork). The catalog row stagger moved from an inline style to `.view > .row:nth-child`
  rules (strict `style-src` ready). CORP same-origin means the web build and the API must
  share one origin (one reverse proxy in production).
- **Reviews** — local review Must 0, four Should fixed in `00ac7e6`; QA pass green
  (`docs/architecture/qa/2026-11-02-security-headers.md`). Codex review failed on usage
  limits; owner approved merging without it (MCDA 460 vs 350).
- **Gate** on `830dea1` — 19 shared + 300 server + 125 web tests, coverage server 98.1 % /
  web 99.8 %, SonarQube PASSED, gitleaks clean, CI 6/6. Squash-merged with owner approval.
- **Follow-ups filed** — #45 `@fastify/static` advisories, #46 strict CSP on the web host,
  #47 dev proxy target from an env var.

## 2026-10-24 — #10 profiles (PR #36 merged, `da3b6e1`)

- **Conception** — spec `docs/architecture/specs/profiles.md` (UC8 pick, UC9 manage),
  sequence + state diagrams under `diagrams/profiles/`, ADR-0008 with owner-validated MCDA
  matrices: profile in the path (`/profiles/:profileId/...`), migration 0005 seeds
  `default` / `Me` keeping existing progress, "Who's watching?" remembered in
  `localStorage`, management open to the network until #18.
- **Implementation** — `profiles` table (unique lower-cased name, 8-colour palette, max
  12, last one undeletable), `watch_progress.profile_id` FK cascade, CRUD routes, progress
  routes moved under the profile. Web: picker, manage screen, header switch, focus
  management, responsive cards (320 → 1440 px).
- **Reviews** — local review Must/Should fixed; QA fixed focus loss and an uncancellable
  delete; owner-reported responsive issues fixed; Codex 2 P2 fixed (Done awaits a fresh
  list, focus after a pick).
- **Gate** on `1b07f11` — 19 shared + 296 server + 124 web tests, coverage server 98.2 % /
  web 100 % lines, SonarQube PASSED, gitleaks clean, CI 6/6. Squash-merged with owner
  approval.

## 2026-10-24 — #27 rename to PopCornTV (PR #34 merged, `858b402`)

- **Why** — popcorno .com is for sale and the npm / GitHub names are taken by torrent
  projects.
- **Decisions** (owner-validated MCDA) — display `PopCornTV`, slug `popcorntv` everywhere
  (npm `@popcorntv/*`, Docker image / service / volume, default SQLite file); SonarQube key
  renamed `popcorno` → `popcorntv` in the UI, history kept; GitHub repo rename and local
  folder + Claude memory move after merge. Historical log entries and QA reports keep the
  old name. No data migration: no production deployment yet.
- **Gate** on `6d0e53e` — 19 shared + 270 server + 100 web tests, coverage ≥ 98 %
  statements, SonarQube PASSED, gitleaks clean, CI 9/9, Codex clean. Squash-merged with
  owner approval.

## 2026-10-24 — #9 resume playback (PR #32 merged, `2abd850`)

- **Conception** — spec `docs/architecture/specs/resume-playback.md` (UC6 resume, UC7 next
  episode), sequence `02-sequence-resume-a-title`, ADR-0007 with four owner-validated MCDA
  matrices: `watch_progress` keyed by `profile_id` `'default'` until #10, FFmpeg `-ss`
  before `-i` with `offsetSec` in the session answer, web `PUT` every 10 s / on pause / on
  close, a Next episode button without autoplay.
- **Implementation** — migration 0004, `progress/` repository + routes (`PUT
  /media/:id/progress`, `GET /progress`), `startSec` on `POST /playback/sessions` (capped,
  start over at or past the end). Web: Resume from m:ss + Start over, per-episode resume,
  serialized saves, nothing saved before metadata + seek, Next episode at ≥ 90 % or `ended`.
- **Reviews** — local review: 0 Must, 14 Should fixed. Codex: 2 P2 fixed (effective start,
  save ordering), re-review clean. QA Chromium + Firefox: pass, 3 Nice fixed (episode names,
  Next announced, spec 2a) (`qa/2026-10-24-resume-playback/`).
- **Gate** on `874697d` — 19 shared + 270 server + 98 web tests, coverage server 98.3 % /
  web 100 % lines, SonarQube PASSED, gitleaks clean, CI 6/6. Squash-merged with owner
  approval. A transient GitHub HTTP 408/502 blocked the last push for a while.

## 2026-10-24 — #8 HLS transcode (PR #29 merged, `76df1fd`)

- **Conception** — spec `docs/architecture/specs/hls-transcode.md`, sequence 02 and state
  05 refined, ADR-0006 with six owner-validated MCDA matrices: every Play posts
  `/playback/sessions`, the server confirms direct play with `directPlayMime` or opens an
  in-memory HLS session; H.264/AAC copied, the rest re-encoded; MPEG-TS EVENT playlist.
- **Implementation** — pure `ffmpeg-args`, `transcoder` (only child-process egress), a
  `SessionManager` (limit reserved before any await, 60 s idle watchdog, crash and close
  cleanup, start-up removal of FFmpeg-owned `session-*` dirs only), session routes with a
  name whitelist. Web: Play for every file with video, hls.js 1.7.3 loaded on demand and
  preferred over native HLS (Chromium claims HLS it cannot demux), one session per player
  (StrictMode-safe), 20 s heartbeat.
- **Reviews** — local review: 4 Must fixed (session-limit race, `rm -rf` of a configurable
  dir, S6819, stale docs). Codex: 9 findings over 5 rounds, 8 fixed (cover art in ffprobe +
  re-probe migration 0003, integer session limit, even scaled height, owned-dir cleanup,
  tool text leaked into four docs, native HLS errors), 1 deferred to #28. CodeQL
  `js/missing-rate-limiting` on the `onReady` hook dismissed as a false positive (owner,
  A 480).
- **Gate** on `c67eef6` — 16 shared + 245 server + 67 web tests, coverage server 98.3 % /
  web 100 % lines, SonarQube PASSED, gitleaks clean, CI 9/9. QA: real HEVC + AC-3 MKV via
  HLS in Chromium and Firefox, close and idle cleanup verified
  (`qa/2026-10-23-issue-8-hls-transcode/`). Squash-merged with owner approval.
- **Filed** — #26 (*arr tools explanation session), #27 (rename to PopCornTV: .com for
  sale, npm and GitHub names used by torrent projects), #28 (FFmpeg reaping on crash,
  input check/open race).

## 2026-10-23 — #7 direct play (PR #22 merged, `aadad38`)

- **Conception** — the spec `docs/architecture/specs/direct-play.md` and the sequence
  `02-sequence-direct-play.md` are in place, and the component diagram is updated.
  ADR-0005 is owner-validated: a pure `decidePlayback` in shared fed by `canPlayType`
  (A 485 vs session 375), and an own single-range route (A 475 vs `@fastify/send` 355).
- **Implementation** — `GET /media/:id/file` answers 200, 206, 416 or 404
  `media_not_found`. The path guard re-runs on every request, then the file is opened
  once with `O_NOFOLLOW` and streamed from that handle. A malformed or multi-range header
  gets 200 (RFC 9110). `isAtOrUnderRoot` is now shared. The web gets a Play button in
  `DetailDialog`, one per episode for a series, and a native `<video>` player in a nested
  `<dialog>`. React propagates `close`, so the detail dialog guards it.
- **Gate** — 16 shared + 191 server + 42 web tests, coverage ≥ 98 %, gitleaks clean,
  CI 9/9. QA: play and seek checked in Chromium and Firefox
  (`qa/2026-10-23-issue-7-direct-play/`). Codex hit its quota, so the owner asked for a
  local `/code-review` (high) instead. It found no bug and 2 cleanups, both applied.
- **Owner decisions** — the empty `<track>` was dropped and S4084 accepted in SonarQube
  (B 380), and SonarQube then PASSED. The per-request guard cost is kept (A 450).
  Squash-merged with owner approval.
- **Filed** — #23 (direct-play follow-ups: ETag/If-Range, HEAD, bit depth, autoplay hint)
  and #24 (WebVTT subtitles).

## 2026-10-23 — #5 catalog grid (PR #20 merged, `b3a3afa`)

- **Conception** — the spec `docs/architecture/specs/catalog-grid.md` covers a benchmark of
  Plex, Jellyfin, Netflix, Disney+ and Prime, plus UC3 / UC4. The catalog diagrams (use case,
  sequence, component, controls state) are in place. ADR-0004 holds the design tokens:
  palette A 480, Inter 450, reducer 440. Its v2 adds discreet gold, navy and violet accents
  plus motion tokens. The vision now records coexistence with the *arr tools (450 / 380 / 170).
- **Implementation** — the React catalog has a hero, rows by type, genre and top rated, and
  progressive-disclosure controls. It also has a native `<dialog>` detail view whose
  openings are versioned by a `seq` against the queued close event. No new server endpoint
  was added (YAGNI).
- **Gate** — 33 web tests at 100 % lines. The Playwright smoke passed 8/8 repeats. SonarQube
  PASSED after 7 fixes (S6819, S6847, S4624). CI was 12/12 green. The Codex P2 findings were
  fixed and answered inline. QA rounds 1–3 are in `qa/2026-10-23-issue-5-catalog-grid/`.
  Squash-merged with owner approval.
- **Filed** — #18 (users, email verification, remote access) and #19 (cast to LAN devices).

## 2026-10-23 — #4 TMDB metadata (PR #16 merged, `dfaaa61`)

- **PR review** — CodeQL raised 2 alerts and Codex 15 findings over five rounds. All were
  fixed and answered inline; the sixth Codex round was clean. Owner MCDA decisions:
  `@fastify/static` for the artwork route (B 430), read access token only (B 450),
  `parsed_title` grouping key with migration 0002 (B 445), one `LibraryLock` shared by scan
  and enrich (A 445). Other fixes: revisits keep the stored match, a single TMDB request
  queue per server, an image cap enforced while streaming, poster / backdrop / stills
  downloaded sequentially.
- **Final gate (2219a4c)** — 157 tests, 98.05 % stmts, SonarQube PASSED, gitleaks clean,
  CI 9/9. QA replayed with the TMDB double (`qa/2026-10-23-issue-4-pr-review/`). The 429
  retry and the lock were exercised. One start-up warn was fixed by creating `ARTWORK_DIR`
  at boot. Squash-merged with owner approval; issue #4 is Done.

- **Conception gate** — Cockburn spec UC2 (`docs/architecture/specs/tmdb-metadata.md`),
  sequence diagram `02-sequence-enrich-metadata.md`, class / component / data-flow updates,
  ADR-0003 with five MCDA matrices (TMDB v3 verified through Context7): plain `fetch`
  client (A 450/500), id-first then title + year with a ±1 retry (A 460), scalar columns +
  JSON `genres` / `cast` on `media` with documentary derived from genre 99 (A 470), poster
  `w500` + backdrop `w1280` cached by digest under `ARTWORK_DIR` and served by
  `GET /artwork/:file` (A 455), scan chains the enrichment + `POST /libraries/:id/enrich
  { refresh }` with sequential requests and one 429 retry (A 480). Owner validated the five
  A options as proposed (`0a83afb`).
- **Implementation** (`fabd3bc`) — `src/metadata/`: zod-validated TMDB client (single HTTP
  egress, injected `fetch`), pure matcher / mapper, artwork cache (write-then-rename,
  digest names), repository, service, routes; migration `0001_tmdb-metadata` (nullable
  columns only); `ScanReport.metadata`; shared contracts; README / `.env.example` /
  CHANGELOG / CLAUDE.md. 135 tests.
- **Local review (`review-local` on fabd3bc)** — five dimensions reconciled in
  `docs/architecture/review-local.md`: 7 Must (2 SonarQube smells, 5 stale doc claims),
  20 Should, 11 Nice. All Must + Should applied: image downloads capped at 10 MB, base URL
  pinned to `https://image.tmdb.org` with no redirect, bounded provider strings, a
  rescanned changed file is looked up again, a series with a newly added episode is
  pending again, absent episodes keep their fields (`markLookedUp`), failures logged
  through an injected logger, deterministic concurrency tests, `sequentially()` helper
  (SonarQube S9382 forbids `await` in a loop, the global TS rule forbids `.then()`
  chains). Tests 135 → 146, coverage 98.3 % stmts / 93.5 % branches, doc coverage 100 %,
  SonarQube PASSED, gitleaks clean. QA with a **mocked TMDB** (no key available):
  `docs/architecture/qa/2026-10-23-issue-4-tmdb-metadata/`. Nice items filed as issue #15.

## 2026-10-22 → 2026-10-23 — #3 Library scan (PR #14 merged)

- **Merged** — PR #14 squash-merged into `main` on 2026-10-23 as `1763c9c`, closing #3.
  The Nice-to-have findings of the local review are tracked in issue #13.

- **Conception gate** — textual Cockburn spec UC1 (`docs/architecture/specs/library-scan.md`),
  sequence diagram `02-sequence-scan-library.md`, ADR-0002 file-naming parser: own regex
  parser (A, 445/500) vs `@ctrl/video-filename-parser` (B, 315) vs `parse-torrent-title`
  (C, 315); owner asked for a deeper analysis, both libraries were run on nine Plex-style
  names (neither reads folder context or provider-id tags), then validated A. Owner
  direction: follow the Plex and Jellyfin naming conventions (ids, editions, parts,
  episode ranges, specials, extras folders) — recorded in the spec.
- **Implementation** — Drizzle + better-sqlite3 schema (`libraries`, `media`, `streams`),
  migration `0000_library-scan`, pure name parser and path guard, `ffprobe` runner as the
  single process egress, scanner (idempotent on size + mtime, deletes missing files,
  reports skipped files with a reason), routes with zod validation. 37 unit tests,
  coverage 95.7 % lines / 90.9 % branches (threshold 80 % in `vitest.config.ts`).
- **QA** — real server + `ffprobe 8.0.1` on a generated fixture (corrupt file, extras folder,
  symlink to `/etc`): `docs/architecture/qa/2026-10-22-issue-3-library-scan/`.
- **Local review (2026-10-23, `review-local` on 57d355c)** — five dimensions reconciled in
  `docs/architecture/review-local.md`: 6 Must, 14 Should, 12 Nice. Gate RED on doc
  coverage (78 %) and the Must list. All Must + Should applied: a present file is never
  pruned (seen before probing; no pruning while a directory is unreadable or the root is
  empty), the guard's real path is what gets probed and stored, pruning diff in JS with
  chunked deletes (SQLite bind limit), **owner decision Must 4 (MCDA A 440/500)**: library
  roots confined under `MEDIA_ROOT`, `HOST` defaults to `127.0.0.1` (Docker sets
  `0.0.0.0`), API exposes `relativePath` instead of the absolute path, generic 500
  handler, series keyed by title + year, parser regex fixes (part separator, plausible
  year, anchored edition suffix, resolution labels, extras only below the title folder,
  show folder wins), `as const` kind lists shared by zod and Drizzle, JSON column mode,
  docs re-aligned (ADR-0002 arithmetic 445 → 455, diagrams 02/03/04, spec). The schema
  change was folded into the single initial migration `0000_library-scan` (nothing
  deployed yet; owner decision, MCDA A 440/500 vs keeping a `0001` ALTER). SonarQube then failed on 7 new code smells
  (regex backtracking, cognitive complexity, `await` in a loop) — cleared in `f5788f3`
  (gate PASSED, 0 issue). Tests 37 → 82, coverage 98.0 % stmts / 95.0 % branches, doc
  coverage 100 %. Second QA pass `qa/2026-10-23-issue-3-library-scan-r2/`. Nice items
  filed as a follow-up issue. Gotcha: pass the SonarQube token through an exported
  variable, not `VAR=… cmd -D…="$VAR"` (zsh expands the argument first → 401).
- **PR #14 review + CI (2026-10-23)** — Codex findings fixed in `477b1f0`: an unreadable
  file disables pruning (P1), the library root's real path is checked against the real
  `MEDIA_ROOT` at scan time (P2), the relative path joins the unchanged fingerprint and a
  second link to a seen file is reported `duplicate` (P2). CI then exposed that the Docker
  image never started: `pnpm deploy` v10 refuses non-injected workspaces (`--legacy`) and
  Node refuses to strip types under `node_modules`, so `@popcorno/shared` now builds to
  `dist/` (types from `src/`, Vitest aliases `src/`) — `f2c8e12`. Trivy image then blocked
  on 17 fixed Debian CVEs (perl, pcre2, gnutls, libcap) the node base image lags behind:
  `apt-get upgrade` in the runtime layer, DL3005 waived inline with the reason. Lesson: a
  local image build is verified by running the container (`/health`, `/proc/1/status`),
  not by its exit code.

## 2026-10-22 — Project bootstrap

- **Project created** — name chosen among plaidou / popcorno / zapette (owner pick:
  popcorno; one homonym on GitHub, unrelated). Folder `~/Documents/02_personal/popcorno`,
  repository initialised on `main`.
- **Decisions**:
  - `stack` — all-TypeScript pnpm monorepo (Fastify + React/Vite + SQLite/Drizzle, FFmpeg
    as an external process). MCDA 460/500 vs Go + React 335 and Rust + React 245; see
    ADR-0001. Fallback: Go server (B), a design change, not a drop-in.
  - `scope` — the product serves the owner's own files only; no content source integrated.
- **GitHub** — public repository `benoit-bremaud/popcorno` created, initial commit
  `d86ad31` pushed to `main` (the only direct commit on `main`: bootstrap). GitHub Project
  #71 "popcorno" linked (Status: Todo / In Progress / Done). Milestone `v0.1.0 — MVP`
  with the seven MVP issues #3, #4, #5, #7, #8, #9, #10 (scan, TMDB, catalog, direct
  play, HLS, resume, profiles), all on the board in Todo. Dependabot opened its first
  action bumps the same minute (#1, #2, #6).
- **Scaffold** — repo skeleton (README, LICENSE MIT, CLAUDE.md, this log, CHANGELOG,
  SECURITY), pnpm workspace (`apps/server`, `apps/web`, `packages/shared`), ESLint +
  Prettier + Vitest, CI (`ci`, `gitleaks`, `codeql`, `dependency-review`, `scorecard`,
  `docker-security`), Dependabot, hardened Dockerfile + compose, SonarQube properties,
  vision document, first UML study of the `playback` feature, ADR-0001.
