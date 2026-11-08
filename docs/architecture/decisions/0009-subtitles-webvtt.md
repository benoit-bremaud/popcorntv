# ADR-0009 — Subtitles: embedded text tracks, extracted on demand and cached, shifted by the server

- Status: accepted (owner validated the weights, #24 chat, 2026-11-03)
- Date: 2026-11-03
- Deciders: owner
- Related: UC10 ([spec](../specs/subtitles.md)), ADR-0005, ADR-0006, ADR-0007, issue #24

## Context

The player has no captions (ADR-0005 consequences, SonarQube S4084). The scanner already
stores every subtitle stream (codec, language). Three choices: which sources to offer,
when to convert to WebVTT, and how to keep cues in sync once an HLS session has started
at a resume offset (its timeline starts at `offsetSec`, ADR-0007 §2). Scores 0–5,
weights /100, totals /500; scores are estimates.

## 1. Subtitle sources

- **A — Embedded text streams only** (srt, ass, ssa, mov_text, webvtt).
- **B — Sidecar `.srt` / `.vtt` files only.**
- **C — Both.**

| Criterion                              | Weight | A                              | B                                     | C   |
| -------------------------------------- | -----: | ------------------------------ | ------------------------------------- | --- |
| Coverage of the real library (MKV)     |     35 | 4 — most MKV embed their tracks | 2 — sidecars are rare                | 5   |
| KISS / #24 scope                       |     30 | 5 — already in the database    | 3 — scanner change, language naming   | 2   |
| Security (path guard)                  |     15 | 5 — the guarded file only      | 3 — a new path to confine             | 3   |
| Testability                            |     20 | 5                              | 4                                     | 4   |
| **Total / 500**                        |    100 | **460**                        | 285                                   | 340 |

Points: A = 140+150+75+100 · B = 70+90+45+80 · C = 175+60+45+80.
Sensitivity: coverage at 60 (others renormalised) keeps A first (4.4 vs 4.0). **A**;
sidecars are a follow-up.

## 2. When to convert to WebVTT

- **A — On demand + disk cache** keyed by (media, track, file mtime).
- **B — At scan time**, every track of every file.
- **C — On demand, no cache.**

| Criterion                        | Weight | A                              | B                         | C                                |
| -------------------------------- | -----: | ------------------------------ | ------------------------- | -------------------------------- |
| Latency when a track is picked   |     25 | 4 — first time slower          | 5                         | 2 — the whole file re-read each time |
| Scan cost / disk                 |     25 | 5 — only the tracks asked      | 1 — the whole library     | 5                                |
| KISS                             |     25 | 3 — cache + invalidation       | 3 — scan pipeline + store | 5                                |
| CPU on a Pi-class host           |     25 | 5                              | 3                         | 2                                |
| **Total / 500**                  |    100 | **425**                        | 300                       | 350                              |

Points: A = 100+125+75+125 · B = 125+25+75+75 · C = 50+125+125+50.
Sensitivity: KISS at 50 ties A and C (4.0); re-reading a 4 GB file per request decides
for **A**.

## 3. Sync after an HLS resume

- **A — The server shifts the cues** by `?offsetSec=`; the cache keeps the unshifted track.
- **B — The web shifts every cue** through the `TextTrack` API.
- **C — No shift** (wrong captions after an HLS resume).

| Criterion                           | Weight | A                       | B                          | C   |
| ----------------------------------- | -----: | ----------------------- | -------------------------- | --- |
| Correctness                         |     40 | 5                       | 4 — races the cue loading  | 0   |
| KISS                                |     25 | 4                       | 3                          | 5   |
| Testability (pure functions)        |     20 | 5 — pure text shift     | 3 — jsdom has no cues      | 5   |
| Works in direct play too            |     15 | 5 — offset 0            | 5                          | 5   |
| **Total / 500**                     |    100 | **470**                 | 375                        | 300 |

Points: A = 200+100+100+75 · B = 160+75+60+75 · C = 0+125+100+75. **A.** The shift is
a pure TypeScript pass over the WebVTT text (`shiftWebVtt`), not a second FFmpeg run.

## Decision

1-A, 2-A, 3-A. `subtitleTracks` (pure, `packages/shared`) lists the offered tracks by
their ordinal among subtitle streams. `apps/server/src/playback/`: `webvtt.ts` (pure
shift), `subtitle-extractor.ts` (cache, in-flight sharing, two runs at most, 120 s timeout,
killed at shutdown, FFmpeg through the injected `Transcoder`), `subtitle-routes.ts`
(`GET /media/:id/subtitles/:index`). New
error code `subtitle_not_found`. The web adds one `<track>` per offered track.

## Consequences

- S4084 is cleared on `PlayerDialog.tsx` for files that carry text subtitles.
- Image subtitles (PGS, VobSub) are not offered; burn-in through HLS is a follow-up.
- ASS styling is lost (WebVTT keeps the text).
- Entries of deleted media stay in `TRANSCODE_DIR/subtitles` until it is emptied by hand;
  they are small text files. A modified file replaces its own entries.
- A resumed HLS session that copies H.264 starts at the keyframe before `startSec`; since
  ADR-0023 (#55) `offsetSec` reports that keyframe, so the cues stay in sync.
