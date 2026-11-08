# ADR-0023 — Copied resume starts on the probed keyframe

- Status: accepted (brick #55, owner approval 2026-11-08)
- Date: 2026-11-08
- Deciders: owner
- Related: spec [resume-playback](../specs/resume-playback.md) 4a, spec
  [hls-transcode](../specs/hls-transcode.md), ADR-0006, ADR-0007 §2, ADR-0009 §3, issue #55

## Context

A resumed HLS session that copies H.264 seeks with `-ss startSec` before `-i`. FFmpeg
lands on the keyframe at or before `startSec`, so the stream starts up to one GOP (group
of pictures between keyframes) early, while the answer said `offsetSec = startSec`. The
player's timeline, the saved position and the shifted subtitle cues ran early by that
much. A re-encoded session is exact.

## Options

A — probe the keyframe with ffprobe before FFmpeg, seek FFmpeg to it and answer it;
B — read the first segment's PTS (presentation timestamp) once the playlist exists;
C — seek accurately by re-encoding the video of every resume.

| Criterion                  | Weight | A                              | B                                | C                  |
| -------------------------- | -----: | ------------------------------ | -------------------------------- | ------------------ |
| Exactness                  |     35 | 5 — the keyframe is the origin | 3 — MPEG-TS start offset to undo | 5                  |
| CPU on the Pi              |     25 | 5 — one short probe            | 5                                | 1 — full re-encode |
| Simplicity and testability |     25 | 4 — pure parser, injected run  | 2 — polling after the playlist   | 4 — one flag       |
| Start latency              |     15 | 4 — one probe more             | 3 — one probe after the playlist | 2 — slower encoder |
| **Total /500**             |        | **465**                        | 345                              | 335                |

Sensitivity: with exactness at 50 and CPU at 10, A stays first (470 against C's 410).

## Decision

A. `KeyframeProbe` (`src/playback/keyframe-probe.ts`) runs `ffprobe -select_streams v:0
-read_intervals <startSec>%+#50 -show_entries packet=pts_time,flags:stream=start_time` and
the pure `parseKeyframe` keeps the first keyframe, relative to the stream start, rounded to
the millisecond, refused past `startSec`. `SessionManager.open` probes only when the video
is copied and `startSec > 0`, before the session-limit check, and returns the keyframe as
`offsetSec`. FFmpeg gets `-ss keyframe + 0.5`: its input seek backs off by up to 3/23 s
when the video has B-frames, so `-ss` exactly on a keyframe lands on the one before (seen in
the #55 QA on MKV); the margin is above that back-off and below any real keyframe interval. A failed probe logs `playback.keyframe.failed` and keeps
`startSec` (the old behaviour). `offsetSec` may now carry a fraction: the subtitle route
accepts a number and the web floors `offsetSec + currentTime` before it saves.

## Consequences

- Timeline, saved positions and subtitles are exact on copied resumes.
- One ffprobe run (≤ 10 s timeout) more per copied resume.
- The `PlaybackStart` contract is unchanged (`offsetSec: number`).
