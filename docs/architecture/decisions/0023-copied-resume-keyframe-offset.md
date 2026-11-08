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

A — probe, before the session, where FFmpeg's seek starts the copied video and answer it;
B — read the first segment's PTS (presentation timestamp) once the playlist exists;
C — seek accurately by re-encoding the video of every resume.

| Criterion                  | Weight | A                              | B                                | C                  |
| -------------------------- | -----: | ------------------------------ | -------------------------------- | ------------------ |
| Exactness                  |     35 | 5 — FFmpeg's own seek measured | 3 — MPEG-TS start offset to undo | 5                  |
| CPU on the Pi              |     25 | 5 — one short probe            | 5                                | 1 — full re-encode |
| Simplicity and testability |     25 | 4 — pure parser, injected run  | 2 — polling after the playlist   | 4 — one flag       |
| Start latency              |     15 | 4 — one probe more             | 3 — one probe after the playlist | 2 — slower encoder |
| **Total /500**             |        | **465**                        | 345                              | 335                |

Sensitivity: with exactness at 50 and CPU at 10, A stays first (470 against C's 410).

## Decision

A. `KeyframeProbe` (`src/playback/keyframe-probe.ts`) runs FFmpeg itself with the
session's seek and maps: `ffmpeg -ss <startSec> -copyts -start_at_zero -i <file> -map 0:V:0
[-map 0:a:<track>] -c copy -frames:v 1 -f framecrc -`, and the pure `parseFramecrc` keeps the
smallest pts over the printed packets, each in its stream's time base: the player's timeline
starts at the earliest packet, and audio can lead the video keyframe by seconds (MPEG-TS, not a scanned container, or a file
remuxed from it).
Asking FFmpeg, not ffprobe, matters: FFmpeg backs its seek off by up to 3/23 s with B-frames, counts `-ss` from the container start and seeks index-less MPEG-TS
differently; an ffprobe `-read_intervals` probe disagreed with it by one GOP in the review
(Matroska with B-frames, late video start, MPEG-TS). `SessionManager.open` probes only when
the video is copied and `startSec > 0`, after a cheap busy check and before the
session-limit reservation; the session keeps `-ss startSec` and answers the probe as
`offsetSec`. A failed probe logs `playback.keyframe.failed` and keeps `startSec` (the old
behaviour). `offsetSec` may now carry a fraction: the subtitle route accepts a number and
the web floors `offsetSec + currentTime` before it saves.

## Consequences

- Timeline, saved positions and subtitles are exact on copied resumes.
- `PlaybackStart.offsetSec` keeps its type but changes meaning for copied HLS resumes: the
  real start, up to one GOP before `startSec`, possibly fractional.
- Residual error measured in review: 0 s with copied audio; up to −0.08 s when the audio is
  re-encoded (its accurate seek trims to `startSec`, the probe copies), instead of up to one GOP.
- One FFmpeg run (≤ 10 s timeout, one packet copied) more per copied resume.
