# UC10 — Turn on subtitles

> **Feature**: Playback — [use cases](../diagrams/playback/01-use-case.md),
> [sequence](../diagrams/playback/02-sequence-turn-on-subtitles.md),
> [component](../diagrams/playback/03-component.md)
> **Issue**: #24 · **Related ADRs**: ADR-0005, ADR-0006, ADR-0007, ADR-0009
> Format: Cockburn casual use case.

The player offers one captions entry per text subtitle stream embedded in the file, served
as WebVTT, in direct play and in HLS alike.

## 1. Requirements

- **R1** A subtitle stream is offered when its codec is a text format FFmpeg converts to
  WebVTT: `subrip` (alias `srt`), `ass`, `ssa`, `mov_text`, `webvtt`, `text`. Image formats
  (`hdmv_pgs_subtitle`, `dvd_subtitle`, …) are not offered (ADR-0009 §1).
- **R2** Tracks are numbered by their ordinal `n` among the file's subtitle streams, so
  FFmpeg's `-map 0:s:n` addresses the same stream (`subtitleTracks` in
  `packages/shared`, the scanner's stream order).
- **R3** `GET /media/:id/subtitles/:index` answers the track as `text/vtt`. FFmpeg extracts it
  on the first request; the result is cached on disk (ADR-0009 §2).
- **R4** `?offsetSec=` (integer ≥ 0, default 0) shifts every cue back by that many
  seconds and drops the cues that ended before it, so the track matches an HLS timeline
  that starts at `offsetSec` (ADR-0007 §2, ADR-0009 §3). Direct play passes 0.
- **R5** The web player adds one `<track kind="subtitles">` per offered track, labelled
  by its language (`Track n` when unknown), none on by default.
- **R6** Done when an MKV with SRT plays with captions in direct play and in HLS (resumed
  too), and the pure helpers and the route have unit tests.

## 2. Data rules

### 2.1 API

`GET /media/:id/subtitles/:index?offsetSec=s`

- `200 text/vtt; charset=utf-8` with the shifted track.
- `400 invalid_request` on a non-uuid id, a non-integer `index` or `offsetSec`.
- `404 media_not_found` for an unknown media or a file that fails the path guard.
- `404 subtitle_not_found` when `index` is not an offered track of that media.
- `500 transcode_failed` when FFmpeg fails or runs past 120 s.

### 2.2 Cache

`TRANSCODE_DIR/subtitles/<mediaId>-<index>-<mtimeMs>.vtt`, unshifted. A modified file gets a
new name, so a stale track is never served; the older entries of that track are removed once
the new one is written. FFmpeg writes `<name>.part`, renamed when it
exits 0. Concurrent requests for the same track share one extraction; at most two extractions run
at once, the others wait; server shutdown kills the running ones (#28). The HLS start-up
clean-up never touches this folder (it removes `mkdtemp` session directories only).

## 3. Main success scenario

1. The viewer plays a title (UC5); the player lists the offered tracks of `item.streams`.
2. The viewer picks a captions entry in the native `<video>` menu.
3. The browser fetches `/api/media/:id/subtitles/:index?offsetSec=…`.
4. The server checks the path, extracts or reads the cached WebVTT, shifts it, answers it.
5. The browser shows the cues in sync with the picture.

## 4. Extensions

- **3a** The media has no offered track: no `<track>`, no captions entry.
- **4a** FFmpeg fails: `500 transcode_failed`; the browser shows no cues, playback goes on.
- **4b** The file changed since the scan: a new cache entry is extracted from it.

## 5. Out of scope

Sidecar `.srt` / `.vtt` files, image subtitles (burn-in through HLS), a default track by
profile language, styling of ASS cues (WebVTT keeps the text only).
