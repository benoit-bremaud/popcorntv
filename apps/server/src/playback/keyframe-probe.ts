import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Process egress of a copied resume (ADR-0023): the media time at which FFmpeg's input
 * `-ss startSec` really starts the session's output, video and `audioTrack` (the index among
 * the audio streams, null without audio). Rejects when FFmpeg fails or prints no packet.
 */
export type KeyframeProbe = (
  filePath: string,
  startSec: number,
  audioTrack: number | null,
) => Promise<number>;

const PROBE_TIMEOUT_MS = 10_000;
const NO_PTS = '-9223372036854775808';
const PROBE_MAX_OUTPUT_BYTES = 64 * 1024;

/**
 * Builds a probe that runs FFmpeg's own seek, with the same `-ss` and maps as the session,
 * and prints the packets up to the first video one (`framecrc`): the player's timeline
 * starts at the earliest of them, audio included (audio can lead the keyframe,
 * as in MPEG-TS or a file remuxed from it). `-copyts -start_at_zero` keeps its
 * time on the media timeline. The path is the `-i` argument, never an option.
 */
export function createKeyframeProbe(ffmpegPath: string): KeyframeProbe {
  return async (filePath, startSec, audioTrack) => {
    const { stdout } = await execFileAsync(
      ffmpegPath,
      [
        '-v',
        'error',
        '-nostdin',
        '-ss',
        String(startSec),
        '-copyts',
        '-start_at_zero',
        '-i',
        filePath,
        '-map',
        '0:V:0',
        ...(audioTrack === null ? [] : ['-map', `0:a:${audioTrack}`]),
        '-c',
        'copy',
        '-frames:v',
        '1',
        '-f',
        'framecrc',
        '-',
      ],
      { timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: PROBE_MAX_OUTPUT_BYTES },
    );
    const start = parseFramecrc(stdout);
    if (start === null) throw new Error('no video packet after the seek');
    return start;
  };
}

/**
 * Pure: the smallest pts over the packets of FFmpeg's `framecrc` output (lines `stream, dts,
 * pts, …`), each times its stream's `#tb`, in seconds, never negative. Null when no packet
 * has a time base.
 */
export function parseFramecrc(output: string): number | null {
  const bases = new Map<string, number>();
  for (const [, stream, num, den] of output.matchAll(/^#tb (\d+): (\d+)\/(\d+)$/gm)) {
    if (Number(den) !== 0) bases.set(stream ?? '', Number(num) / Number(den));
  }
  let start: number | null = null;
  for (const [, stream, pts] of output.matchAll(/^(\d+),\s*-?\d+,\s*(-?\d+),/gm)) {
    const base = bases.get(stream ?? '');
    // FFmpeg prints a missing pts as INT64_MIN: no time to report.
    if (base === undefined || pts === NO_PTS) continue;
    const time = Number(pts) * base;
    start = start === null ? time : Math.min(start, time);
  }
  return start === null ? null : Math.max(0, start);
}
