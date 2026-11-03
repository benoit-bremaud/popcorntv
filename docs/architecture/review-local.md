# Local review — popcorntv (#24 subtitles as WebVTT tracks)

Pre-push and pre-merge review of branch `feat/24-subtitles-webvtt`.

- Date: 2026-11-03
- Commit: a82afd8 (reviewed), fixes in the follow-up commit
- Scope: branch diff `origin/main...HEAD` (`apps/server/src/playback/{webvtt,subtitle-extractor,subtitle-routes}.ts`, `apps/server/src/app.ts`, `packages/shared/src/subtitles.ts`, `apps/web/src/{api.ts,playback/PlayerDialog.tsx}`, docs)
- Checks run: design · docs · tests · security · correctness (no container file touched)
- Verdict: ship (every Should fixed, owner decision 2026-11-03, MCDA 450/500) · Must 0 · Should 7 fixed · Nice 6

## Pre-merge gate (head SHA a82afd8, re-run after the fixes)

| Step | Result |
|---|---|
| 1 Tests | ✅ 334 server · 129 web · 31 shared (Vitest); no E2E suite yet |
| 2 Coverage | server 98.3 % stmts / 95.6 % branches / 95.6 % funcs / 98.4 % lines · web 99.8 / 93.4 / 100 / 100 · shared 88.9 / 100 / 100 / 86.7 (floor 80) · docs ≈ 100 % of the new exports (floor 90) |
| 3 SonarQube | ✅ PASSED, no issue on the changed files |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 QA pass | ✅ pass · direct play and resumed HLS captions in sync with real FFmpeg · report: [2026-11-03-subtitles.md](qa/2026-11-03-subtitles.md) |

- Gate: **GREEN**

## 🔴 Must Have

_None._

## 🟡 Should Have (all fixed)

- `apps/server/src/playback/subtitle-extractor.ts` `[design][security]` · Unbounded concurrent FFmpeg runs, runs not killed at shutdown (#28 invariant), timeout rejected before FFmpeg exited · two runs at most (queue), `closeAll()` in `preClose`, the timeout settles on exit.
- `apps/server/src/playback/subtitle-routes.ts` `[design]` · Cache-key policy (`stat` mtime) leaked into the route, four positional arguments · `get(mediaId, index, filePath)` stats the file itself.
- `apps/web/src/playback/PlayerDialog.tsx` `[design]` · `/api` prefix hard-coded · `subtitleUrl()` in `api.ts`.
- `apps/server/src/playback/subtitle-extractor.ts` `[security]` · Cache grew forever on modified files · older entries of the track removed after a new extraction.
- `apps/server/src/playback/subtitle-extractor.ts` `[correctness]` · Any cache read error re-extracted · only `ENOENT` counts as a miss.
- `docs/architecture/specs/subtitles.md`, sequence, ADR-0009 `[docs]` · `:n` vs `:index`, `extract()` vs `get()`, `srt` missing in R1, `timeoutMs` undocumented · aligned.
- Tests `[tests]` · mtime re-extraction, path guard escape, unshifted cache shifted per request, retry after failure, queue, `closeAll`, WebVTT edge cases, direct-play track URL, codec allowlist · added.

## 🔵 Nice to Have

- `apps/server/src/playback/subtitle-routes.ts` `[security]` · FFmpeg opens the checked path by name (check-then-use); same as the HLS route; needs write access to the media tree.
- `apps/server/src/playback/subtitle-routes.ts` `[correctness]` · `offsetSec` has no upper bound; a huge value only drops every cue.
- `apps/server/src/playback/webvtt.ts` `[design]` · The timing regex runs twice per cue block.
- `apps/server/src/playback/subtitle-routes.ts` `[design]` · `confinedPath` imported from another route module; move it on a third consumer.
- `apps/server/src/playback/webvtt.ts` `[correctness]` · A cue with an empty payload merges block boundaries; harmless.
- Resumed copy sessions start one GOP early → cues may run early · filed as #55 (inherited from ADR-0007 §2).

## ⚪ Disagree / Intentional

- `SubtitleExtractor` used as a concrete class, no port: single implementation (architecture skill, `SessionManager` precedent).
- `subtitleArgs` beside its only caller, not in the HLS `ffmpeg-args.ts`.
- `TRANSCODE_DIR/subtitles` survives restarts on purpose: `SessionManager.clean()` removes session directories only.

## Per-dimension summary

- Design: flat, matches ADR-0009; three local Should fixed. · Docs: ≈ 100 % of exports, naming aligned. · Tests: healthy pyramid, fake only at the FFmpeg boundary. · Security: no injection or traversal, resource limits added. · Correctness: WebVTT shift verified on hours, BOM, NOTE/STYLE, CRLF.
