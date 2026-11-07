# UC25 — Choose the audio track

The viewer picks the audio track (language) of a file with several before pressing Play.

> **Feature**: Watch — [use cases](../diagrams/playback/01-use-case.md)
> **Issue**: #136 · **Related ADRs**: ADR-0005, ADR-0006, ADR-0019
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** `audioTracks(streams)` (packages/shared, pure) lists a file's audio streams,
  numbered among them, with codec and language.
- **R2** `POST /playback/sessions` accepts `audioIndex` (integer 0–99, default 0). Any value
  but 0 is served through HLS even when the browser could play the file directly: browsers
  cannot switch the track of a direct `<video>` (ADR-0019). An index past the last track
  is the first track (R3) and may still play directly.
- **R3** FFmpeg maps `0:a:<audioIndex>` and encodes that track by its own codec (copied when
  HLS-safe, else stereo AAC); an index past the last track falls back to the first.
- **R4** The detail dialog shows an **Audio** select (language, else "Track N", plus the
  codec) when the title (a series: its first episode) has more than one track. The choice
  applies to every Play of the dialog, Next episode included.
- **R5** Done when `audioTracks`, the FFmpeg mapping, the forced HLS and the select have
  tests.
