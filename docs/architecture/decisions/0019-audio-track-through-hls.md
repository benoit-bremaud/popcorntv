# ADR-0019 — A non-default audio track plays through HLS

- Status: accepted (owner chose A in the #131 chat, 2026-11-07)
- Date: 2026-11-07
- Deciders: owner
- Related: spec [audio-track](../specs/audio-track.md), ADR-0005, ADR-0006, issue #136

## Context

Files often carry several audio tracks (original language, dub, commentary). Direct play
gives the browser the whole file, and only Safari exposes `HTMLMediaElement.audioTracks`.
HLS (ADR-0006) already maps one audio stream with FFmpeg.

## Options

A — a track select; a non-default track forces HLS with `-map 0:a:N`; B — the browser's
`audioTracks` API in direct play; C — force HLS for every file with several tracks.

| Criterion     | Weight | A                                         | B                               | C                                    |
| ------------- | -----: | ----------------------------------------- | ------------------------------- | ------------------------------------ |
| Browsers      |     40 | 5 — every browser                         | 1 — Safari only                 | 5 — every browser                    |
| Transcode cost |    30 | 4 — only when a track is chosen; video copied when H.264 | 5 — none        | 2 — every multi-track file transcodes |
| Simplicity    |     30 | 4 — one body field, one map index         | 3 — per-browser code paths      | 4 — one rule                         |
| **Total**     |    100 | **440**                                   | **280**                         | **380**                              |

Sensitivity: with weights 30 / 50 / 20, A (430) still leads B (340) and C (330).

## Decision

A. The default track keeps direct play; any other one goes through HLS.

## Consequences

- Choosing a dub costs an HLS session (one transcode slot, ADR-0012) but not a video
  re-encode for H.264 files.
- The track is chosen before Play; switching mid-play is a later improvement.
- Direct play leaves the default track to the browser (the default-disposition stream),
  which may differ from the first audio stream that HLS maps for index 0.
