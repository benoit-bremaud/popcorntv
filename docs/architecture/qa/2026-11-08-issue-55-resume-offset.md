# QA — #55 copied resume reports the real HLS start

Targeted pass on the local production build of `a0aedb0` (`node dist/index.js`, fresh
database, throw-away test account), real FFmpeg 8, 2026-11-08. Local staging held the
owner's account, so it was not reset.

## Fixture

`media/films/Gop Test (2024).mkv` (not committed): 120 s `testsrc` H.264 at 24 fps with
B-frames, a keyframe every 10 s, AAC audio and one SubRip track from 0 to 120 s. The
picture shows the media second, so the first frame of `segment-00000.ts` tells where
FFmpeg really started.

## Results

| Check | Request | Expected | Observed | Verdict |
|---|---|---|---|---|
| R55-01 | resume 47 s | `offsetSec` ≈ 40 (keyframe before), first frame 40 | `39.961`, frame 40 ([shot](2026-11-08-issue-55-resume-offset/01-resume-47-first-frame-40.png)) | OK |
| R55-02 | resume 40 s (exactly on a keyframe) | FFmpeg backs off to 30; `offsetSec` ≈ 30 | `29.954`, frame 30 ([shot](2026-11-08-issue-55-resume-offset/02-resume-40-first-frame-30.png)) | OK |
| R55-03 | start 0 | `offsetSec: 0`, no probe | `0` | OK |
| R55-04 | subtitles at the answered `offsetSec` | cue end = 120.023 − `offsetSec` | 80.062 and 90.069 | OK |
| R55-05 | probe vs player start on the reviewer's MKV / MP4 / late-video MKV / MPEG-TS files | equal to the measured player start | 4.949 / 4.928 / 5.440 / 6.805, all equal (`.ts` is not a scanned container: probed directly) | OK |
| R55-06 | `playback.keyframe.failed` in the log | none | 0 | OK |

Before the fix, R55-01 answered `offsetSec: 47` for a stream that started at 40: positions
and subtitles ran 7 s ahead, and on the Pi Sintel drifted 16 s per resume (full pass
2026-11-08, FON-02).

## Not covered

- The browser player on staging: the server answer, the HLS output and the web unit tests
  (`seeks a copied HLS resume from its keyframe and saves whole seconds`) cover the chain;
  the owner's next staging pass should replay Sintel resume (QA ledger row Resume).
