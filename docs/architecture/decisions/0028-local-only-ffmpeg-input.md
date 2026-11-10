# ADR-0028 — Confine every FFmpeg and ffprobe input to a local container file

- Status: accepted (owner chose B in the #118 chat, 2026-11-10; totals corrected in review)
- Date: 2026-11-10
- Deciders: owner
- Related: ADR-0006, ADR-0009, ADR-0023, issues #118, #110, #114 (SA-04)

## Context

The server runs FFmpeg or ffprobe at four places: the scan probe (`library/ffprobe`), the
HLS transcode (`playback/ffmpeg-args`), the keyframe probe (ADR-0023) and the subtitle
extraction (ADR-0009). None restricted the input. FFmpeg picks the demuxer from the file's
content, not its extension. Checked on FFmpeg 8.0.1 (dev host) and 9.0.2 (the image):

- A `movie.mkv` holding `ffconcat version 1.0` / `file 'other.mkv'` probes as `concat` and
  reads the sibling file: concat's `safe=1` refuses absolute paths, not relative ones.
- HLS is not detected outside a `.m3u8` name, and the HLS / DASH demuxers already restrict
  their nested opens to `file,crypto,data`: the network case is closed upstream today, by
  defaults a later FFmpeg could change.
- Without a format restriction every demuxer of the static build (hundreds of parsers) is
  reachable from a library file, the CVE surface raised in #110.

## Decision

Every call places `localInputArgs()` (`apps/server/src/ffmpeg-input.ts`) right before its
single `-i`:

- `-protocol_whitelist file`: the input and anything its demuxer opens use the `file`
  protocol only (no network, no pipe). Outputs are not affected.
- `-format_whitelist matroska,mov,avi,mpegts`: the demuxers of the scanner's
  `SUPPORTED_EXTENSIONS` (mkv/webm, mp4/m4v/mov, avi) plus MPEG-TS. None of them opens
  another resource; playlist demuxers (`hls`, `concat`, …) are refused, so a crafted file is
  skipped as unprobeable at scan time and cannot be played.

MPEG-TS is kept because files remuxed from a TS carry it under another name (ADR-0023).

A unit test keeps the list in step with `SUPPORTED_EXTENSIONS`; an opt-in integration test
(`FFMPEG_IT=1`) runs the real ffprobe on a sibling concat list (with a control showing the
protocol whitelist alone lets it through) and on a DASH manifest pointing at a local
listener, both named `.mkv` and refused with "not on whitelist".

## Options (MCDA, weights validated by the owner)

| Criterion (weight) | A protocol whitelist only | B A + format whitelist | C A + refuse playlist formats at scan |
|---|---|---|---|
| Security (40) | 3 — no network, local files still readable | 5 — no playlist demuxer at all | 4 — a file swapped after the scan slips through |
| Media compatibility (25) | 5 | 3 — an incomplete list breaks legit files | 5 |
| Simplicity (20) | 5 | 4 | 3 — new scan rule and state |
| Testability (15) | 5 | 5 | 4 |
| **Total /500** | 420 | **430** | 405 |

Sensitivity: with compatibility at 30 and security at 35, A leads (430 vs 420). B was kept:
the list-versus-extensions test catches a container added to the scanner. It does not catch a
file whose content differs from its name (MPEG-PS in a `.avi`): such a file, playable before,
is now skipped as unprobeable at scan and keeps its row and progress.

## Consequences

- Adding a container to the scanner needs its demuxer in `INPUT_FORMATS` (the test fails
  otherwise).
- External sidecar subtitles (#186) will need their own demuxer (`srt`, `webvtt`) on that
  call only.
