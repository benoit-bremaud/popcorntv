# QA pass — TMDB-dependent cases on local staging (2026-11-12)

Pass (level `pass`, product part) replaying the cases that were BLOCKED in the [2026-11-11 full pass](2026-11-11-full-pass-staging.md) because the staging TMDB key was a placeholder. Production image of `8c1ea1f` on local staging (https://localhost:8443), valid TMDB key now set in the gitignored `.env.staging` (#300).

| Level | Head SHA / base | Environment | Targets | Agent / model | Matrix page |
|---|---|---|---|---|---|
| pass | 8c1ea1f / 1088e1a (previous QA image) | local staging (`popcorntv-staging`, image `staging-8c1ea1f`) | W | Claude Code · Sonnet 5.5 | — (not published) |

Checklist: `61702fb560a9`

**Environment**: local staging only; the Pi was never touched. Driven in the owner's Chrome (cert exception accepted by the owner), signed in as `qa-tester` (owner), plus a temporary viewer account, a second profile, title links and a wishlist entry, all deleted at the end. Test data: generated clips in `./media` (Films, Series, Docs). Variations of `.env.staging` (TMDB unreachable through a dead proxy, `WISHLIST_CHECK_INTERVAL_MIN=0`, key unset) were restored afterwards. API probes with `curl -k`. Provider changes were simulated by editing `wishlist.seen_provider_ids` in the container database. Server logs of the pass window were read (the container is recreated on each env change, so logs before the last recreation are lost).

## QA matrix

Gate ⚠️ (3 new defects, none Must) · 🔴 Must 0 · 🟡 Should 1 · 🔵 Nice 2 — 15 cases: Pass 8 · Fail 3 · Not tested 4

| ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots |
|---|---|---|---|---|---|---|---|
| LOT-166 | FON | Discover live search 1, 3, 4, 7, 8, 10 | Pass | PASS | typing queries the TMDB search live, results replace the rows, a network cut shows the error line and recovers; 9 (screen reader) not run | | 03-live-search-dune.jpg, 04-search-network-cut.jpg |
| LOT-257 | FON | Discover list freshness | Pass | PASS | four lists warmed on start, served stale while one shared call refreshes | | 02-discover-rows.jpg |
| LOT-184 | FON | Where to watch 1, 4, 5, 6 | Pass | PASS | offers grouped with logos, none-case message, "Offers could not be loaded" when TMDB is down, unissued logo path 404 | | 05-where-to-watch-no-offer.jpg, 06-where-to-watch-offers.jpg, 13-offers-could-not-be-loaded.jpg |
| LOT-184 | SEC | Where to watch 2 (offer link: new tab, `window.opener` null, no `Referer`) | Not tested/N/A | NOT TESTED | offer links deliberately not clicked (third party) | | |
| LOT-277 | FON | Wishlist notifications 1–4, 7 | Pass | PASS | library arrival and provider events create a notification (`notification.created` in the log), bell badge, opens the sheet, read on open, "my providers" isolated per profile, interval 0 disables the check | | 07-my-providers-netflix.jpg, 08-providers-other-profile.jpg, 09-bell-badge.jpg, 10-bell-library-line.jpg, 11-bell-opens-sheet.jpg, 12-play-in-my-library.jpg, 19-bell-provider-line.jpg |
| LOT-277 | ROB | Discover with no TMDB key (wording) | Fail | FAIL | API answers `409 tmdb_not_configured`; the UI shows "TMDB could not be reached." | #304 | 21-discover-tmdb-down.jpg |
| LOT-277 | ROB | Wishlist check with no TMDB key (6, second half) | Not tested/N/A | NOT TESTED | the worker was not observed with the key unset (no TMDB call, no library notification for a newly scanned unmatched file); only the interval `0` half of case 6 was run | | |
| LOT-277 | DAT | Database without migration 0009 (8) | Not tested/N/A | NOT TESTED | no pre-0009 database available | | |
| LOT-278 | FON | Title link UI 1 (form, save, link shown), 2 | Pass | PASS | form opens, `javascript:` and credentials refused, saved link shown, viewer sees it with no edit control | | 14-link-form.jpg, 15-link-refused.jpg, 16-link-saved.jpg, 18-viewer-link-no-edit.jpg |
| LOT-278 | SEC | Title link UI 1 (open: new tab, `window.opener` null, no `Referer`) | Not tested/N/A | NOT TESTED | the saved link was deliberately not clicked (third party) | | |
| LOT-278 | A11Y | Title link UI 7 (focus, attributes) | Fail | FAIL | after Add or Remove `document.activeElement` is `BODY`; the URL input has no `name` and no `autocomplete` | #303 | 17-link-edit-remove.jpg |
| LOT-172 | FON | Cast line (3) | Pass | PASS | series dialog lists the cast from TMDB | | 20-series-dialog-cast.jpg |
| OBS-01 | DAT | Metadata coverage | Fail | FAIL | Sprite Fright (file 2021, TMDB 2024, id 891761) rejected by the ±1-year rule, recovered with `[tmdbid-891761]` (#258); a matched title with `overview: null` shows "No synopsis yet." (#259); `The.Wire/Season.01/The.Wire.S01E01.mp4` scanned as series "Season 01" and unmatched, while `Breaking Bad/Season 01/` works (#302) | #258, #259, #302 | 01-libraries-added.png |
| LOT-179 | ROB | Discover with TMDB unreachable | Pass | PASS | dead proxy: rows show "TMDB could not be reached.", app stays usable | | 21-discover-tmdb-down.jpg |
| OBS-01b | DAT | Wrong `[tmdbid-999999999]` tag and unmatched file | Pass | PASS | fall back to unmatched without crashing the scan | | |

## Findings to act on

1. 🟡 Should — `Show/Season.01/Show.S01E01` is parsed as series "Season 01" and never matched (OBS-01) → #302.
2. 🔵 Nice — title-link form loses focus after Add/Remove and its field lacks `name` / `autocomplete="off"` (LOT-278 7) → #303, `17-link-edit-remove.jpg`.
3. 🔵 Nice — "TMDB could not be reached." shown when TMDB is not configured (LOT-277 6) → #304.
4. Existing, root cause or reproduction added as comments: #258 (TMDB lists Sprite Fright as 2024, the ±1-year rule rejects the 2021 file, `[tmdbid-891761]` recovers it), #259 (overview null, no fallback).

## Not tested

- LOT-166 case 9 and #165 5, 6 / A11Y-04: no screen reader (Orca).
- LOT-277 case 8: no database without migration 0009.
- Provider-change notifications were produced by editing `wishlist.seen_provider_ids`, not by a real TMDB change.
- Third-party links (TMDB watch page, example.org) deliberately not opened: #184 check 2 and the navigation half of #278 UI 1 (new tab, `window.opener` null, no `Referer`) have no verdict.
- LOT-277 case 6, second half: the wishlist check was not observed with `TMDB_API_KEY` unset (no TMDB call, no library notification for a new unmatched file).
- Server logs before the last container recreation are lost.
- Cleanup: the generated clips in `./media` could not be deleted by the agent (permission denied); `media/Films`, `media/Series`, `media/Docs` remain for the owner to remove.

## Delta vs previous report

`2026-11-11-full-pass-staging.md`: every TMDB-BLOCKED case (#166 1, 3, 4, 7–10, #257, #184, #277 1–4, 6–8, #278 UI 1, 2, 7, #172 3, OBS-01) was replayed, except #184 check 2, the no-key half of #277 case 6, #277 case 8 and the link opening of #278 UI 1, which stay not tested; new #302, #303, #304; #258 and #259 explained.

## Verdict

No 🔴 Must. The TMDB features work end to end on `8c1ea1f` with a real key, the outbound-link checks (new tab, noopener, no `Referer`) and the no-key wishlist check left to replay; the Pi (real key) can be smoke-checked the same way after deploy. Open: #302 parser gap (Should), #303 and #304 polish.
