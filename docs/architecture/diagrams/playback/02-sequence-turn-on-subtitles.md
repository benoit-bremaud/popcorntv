# Sequence diagram — playback — turn on subtitles

> **Feature**: UC10 Turn on subtitles — [use cases](01-use-case.md),
> [spec](../../specs/subtitles.md)
> **Related ADRs**: ADR-0006, ADR-0007, ADR-0009

## Context

Subtitles ride on the UC5 flow ([sequence](02-sequence-watch-a-title.md)): the player is
already playing, directly or through HLS. Only the track request is drawn.

## Diagram

```mermaid
sequenceDiagram
  actor V as Viewer
  participant P as Web player
  participant API as Subtitle routes
  participant SX as SubtitleExtractor
  participant FF as FFmpeg runner
  participant C as Cache (TRANSCODE_DIR/subtitles)

  P-->>V: Captions menu, one entry per text track
  V->>P: Pick a track
  P->>API: GET /media/:id/subtitles/:index?offsetSec=s
  API->>API: validate, subtitleTracks(streams), path guard
  alt unknown media or path escape
    API-->>P: 404 media_not_found
  else index not offered
    API-->>P: 404 subtitle_not_found
  else
    API->>SX: get(mediaId, index, file)
    alt cached
      SX->>C: stat file, read <mediaId>-<index>-<mtime>.vtt
    else first request (shared by concurrent ones)
      SX->>FF: -map 0:s:index -f webvtt <name>.part
      FF-->>SX: exit 0
      SX->>C: rename .part to .vtt, remove older mtimes
    end
    alt FFmpeg failed or timed out
      SX-->>API: error
      API-->>P: 500 transcode_failed
    else
      SX-->>API: WebVTT text
      API->>API: shiftWebVtt(text, s)
      API-->>P: 200 text/vtt
      P-->>V: Cues in sync with the picture
    end
  end
```

## Notes

- `s` is the session's `offsetSec`: 0 in direct play, the resume point in HLS.
- The cache keeps the unshifted track, so one extraction serves every offset.
