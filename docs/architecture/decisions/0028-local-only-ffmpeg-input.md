# ADR-0028 — Confine every FFmpeg and ffprobe input to a local container file

- Status: accepted (owner chose B in the #118 chat, 2026-11-10)
- Date: 2026-11-10
- Deciders: owner
- Related: ADR-0006, ADR-0009, ADR-0023, issues #118, #110, #114 (SA-04)

## Context

The server runs FFmpeg or ffprobe at four places: the scan probe (`library/ffprobe`), the
HLS transcode (`playback/ffmpeg-args`), the keyframe probe (ADR-0023) and the subtitle
extraction (ADR-0009). None restricted the input. FFmpeg picks the demuxer from the file's
content, not its extension, so a crafted `movie.mkv` holding an HLS playlist or a concat list
makes FFmpeg open URLs (the static build in the image enables http, rtmp, ssh, srt, zmq…)
or other local files.

## Decision

Every call places `localInputArgs()` (`apps/server/src/ffmpeg-input.ts`) right before its
single `-i`:

- `-protocol_whitelist file`: the input and anything its demuxer opens use the `file`
  protocol only (no network, no pipe). Outputs are not affected.
- `-format_whitelist matroska,mov,avi,mpegts`: the demuxers of the scanner's
  `SUPPORTED_EXTENSIONS` (mkv/webm, mp4/m4v/mov, avi) plus MPEG-TS. None of them opens
  another resource; playlist demuxers (`hls`, `concat`, …) are refused, so a crafted file is
  skipped as unprobeable at scan time and cannot be played.

A unit test keeps the list in step with `SUPPORTED_EXTENSIONS`; an opt-in integration test
(`FFMPEG_IT=1`) runs the real ffprobe on a crafted HLS and concat file.

## Options (MCDA, weights validated by the owner)

| Criterion (weight) | A protocol whitelist only | B A + format whitelist | C A + refuse playlist formats at scan |
|---|---|---|---|
| Security (40) | 3 — no network, local files still readable | 5 — no playlist demuxer at all | 4 — a file swapped after the scan slips through |
| Media compatibility (25) | 5 | 3 — an incomplete list breaks legit files | 5 |
| Simplicity (20) | 5 | 4 | 3 — new scan rule and state |
| Testability (15) | 5 | 5 | 4 |
| **Total /500** | 415 | **420** | 400 |

Sensitivity: with compatibility at 30 and security at 35, A leads (425 vs 410); B was kept
because the compatibility risk is closed by the list-versus-extensions test.

## Consequences

- Adding a container to the scanner needs its demuxer in `INPUT_FORMATS` (the test fails
  otherwise).
- External sidecar subtitles (#186) will need their own demuxer (`srt`, `webvtt`) on that
  call only.
