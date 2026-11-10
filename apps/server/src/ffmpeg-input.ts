/**
 * Demuxers FFmpeg may use on a library file (ADR-0028): the containers of the scanner's
 * `SUPPORTED_EXTENSIONS`, plus MPEG-TS. None of them opens another file or URL, unlike the
 * playlist demuxers (`hls`, `concat`, …) FFmpeg would pick by content for a crafted file.
 */
export const INPUT_FORMATS: readonly string[] = ['matroska', 'mov', 'avi', 'mpegts'];

/**
 * Options placed right before every `-i` of an FFmpeg or ffprobe call (ADR-0028): the input
 * may only be read through the `file` protocol (no network, no pipe) and only by a
 * whitelisted container demuxer.
 */
export function localInputArgs(): string[] {
  return ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_FORMATS.join(',')];
}
