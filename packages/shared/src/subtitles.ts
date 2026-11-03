import type { StreamInfo } from './index.js';

/** Subtitle codecs FFmpeg converts to WebVTT; image formats (PGS, VobSub) are left out (ADR-0009 §1). */
const TEXT_SUBTITLE_CODECS: ReadonlySet<string> = new Set([
  'subrip',
  'srt',
  'ass',
  'ssa',
  'mov_text',
  'webvtt',
  'text',
]);

/** A subtitle stream the player can offer (spec subtitles R1–R2). */
export interface SubtitleTrack {
  /** Ordinal among the file's subtitle streams: FFmpeg's `-map 0:s:<index>`. */
  readonly index: number;
  /** Lower-cased ffprobe codec name. */
  readonly codec: string;
  /** ISO 639 tag from the file; null when it has none. */
  readonly language: string | null;
}

/** The text subtitle tracks of a file, numbered among all its subtitle streams. */
export function subtitleTracks(streams: readonly StreamInfo[]): SubtitleTrack[] {
  return streams
    .filter((stream) => stream.type === 'subtitle')
    .map((stream, index) => ({
      index,
      codec: stream.codec.toLowerCase(),
      language: stream.language,
    }))
    .filter((track) => TEXT_SUBTITLE_CODECS.has(track.codec));
}
