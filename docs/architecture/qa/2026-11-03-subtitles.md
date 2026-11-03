# QA pass — #24 subtitles as WebVTT tracks (2026-11-03)

Pass level, Chromium (built-in browser), local tier: server on port 3010 with real FFmpeg,
Vite dev server proxying `/api`.

## Fixture

A 20 s test pattern (H.264 + AAC) with one French SRT track (cues at 1 s "Bonjour" and
12 s "Plus tard"), muxed to MKV; a second copy re-encoded to MPEG-4 Part 2 + MP3 so it
can only play through HLS.

## Results

| Check | Result |
| --- | --- |
| `GET /media/:id/subtitles/0` → `200 text/vtt; charset=utf-8`, security headers present | Pass |
| `?offsetSec=10` drops the 1 s cue and moves the 12 s cue to 2 s | Pass |
| Unshifted track cached as `<mediaId>-0-<mtime>.vtt` under `TRANSCODE_DIR/subtitles` | Pass |
| Index 1 (no such track) → `404 subtitle_not_found` | Pass |
| Player: one `<track>` labelled `fre`, `offsetSec=0`; "Bonjour" shown at 0:01 | Pass — [01](2026-11-03-subtitles/01-direct-play-captions.jpg) |
| HLS resumed at 0:10: track `offsetSec=10`; at player time 0:02 the picture shows 12 s and "Plus tard" | Pass — [02](2026-11-03-subtitles/02-hls-resumed-captions.jpg) |

## Notes

- Leaving a page without closing the player keeps the transcode slot until the 60 s idle
  watchdog frees it (ADR-0006 §4): expected behaviour, not a defect.
