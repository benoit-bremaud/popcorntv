import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Process egress of a copied resume (ADR-0023): the media time at which FFmpeg's input
 * `-ss startSec` really starts the copied video. Rejects when FFmpeg fails or prints no frame.
 */
export type KeyframeProbe = (filePath: string, startSec: number) => Promise<number>;

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_OUTPUT_BYTES = 64 * 1024;

/**
 * Builds a probe that runs FFmpeg's own seek, with the same `-ss` and map as the session,
 * and prints the first copied video packet (`framecrc`). `-copyts -start_at_zero` keeps its
 * time on the media timeline. The path is the `-i` argument, never an option.
 */
export function createKeyframeProbe(ffmpegPath: string): KeyframeProbe {
  return async (filePath, startSec) => {
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
 * Pure: the first packet's pts × the stream time base from FFmpeg's `framecrc` output, in
 * seconds, never negative. Null when there is no time base or packet.
 */
export function parseFramecrc(output: string): number | null {
  const base = /^#tb 0: (\d+)\/(\d+)$/m.exec(output);
  const packet = /^0,\s*(-?\d+),/m.exec(output);
  if (base === null || packet === null) return null;
  const [num, den] = [Number(base[1]), Number(base[2])];
  if (den === 0) return null;
  return Math.max(0, (Number(packet[1]) * num) / den);
}
