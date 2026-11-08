import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Process egress of a copied resume (ADR-0023): the media time of the video keyframe a
 * `-ss startSec` input seek lands on. Rejects when ffprobe fails or finds no keyframe.
 */
export type KeyframeProbe = (filePath: string, startSec: number) => Promise<number>;

interface KeyframeOutput {
  readonly packets?: readonly { readonly pts_time?: string; readonly flags?: string }[];
  readonly streams?: readonly { readonly start_time?: string }[];
}

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_OUTPUT_BYTES = 1024 * 1024;
/** Packets read after the seek; the demuxer lands on a keyframe, this is only a margin. */
const PACKETS_READ = 50;

/**
 * Builds a probe that seeks the first video stream like FFmpeg's input `-ss` does and
 * reads the first keyframe there. The path is the `-i` argument, never an option.
 */
export function createKeyframeProbe(ffprobePath: string): KeyframeProbe {
  return async (filePath, startSec) => {
    const { stdout } = await execFileAsync(
      ffprobePath,
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-read_intervals',
        `${startSec}%+#${PACKETS_READ}`,
        '-show_entries',
        'packet=pts_time,flags:stream=start_time',
        '-print_format',
        'json',
        '-i',
        filePath,
      ],
      { timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: PROBE_MAX_OUTPUT_BYTES },
    );
    const keyframe = parseKeyframe(JSON.parse(stdout) as KeyframeOutput, startSec);
    if (keyframe === null) throw new Error('no keyframe found');
    return keyframe;
  };
}

/**
 * Pure: the first keyframe at or before `startSec`, relative to the stream start (FFmpeg's
 * `-ss` counts from there), rounded to the millisecond. Null when there is none.
 */
export function parseKeyframe(output: KeyframeOutput, startSec: number): number | null {
  const origin = Number(output.streams?.[0]?.start_time ?? 0);
  const base = Number.isFinite(origin) ? origin : 0;
  for (const packet of output.packets ?? []) {
    if (!(packet.flags ?? '').startsWith('K')) continue;
    const pts = Number(packet.pts_time);
    if (!Number.isFinite(pts)) continue;
    const time = Math.round((pts - base) * 1000) / 1000;
    return time >= 0 && time <= startSec ? time : null;
  }
  return null;
}
