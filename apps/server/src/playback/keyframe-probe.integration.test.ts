import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createKeyframeProbe } from './keyframe-probe.js';

/**
 * Opt-in (`FFMPEG_IT=1`): runs the real FFmpeg on a B-frame Matroska file with a keyframe
 * every 5 s, the case where an ffprobe probe disagreed with FFmpeg's seek (ADR-0023).
 */
describe.runIf(process.env['FFMPEG_IT'] === '1')('createKeyframeProbe with FFmpeg', () => {
  let dir: string;
  let file: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'popcorntv-keyframe-'));
    file = join(dir, 'gop.mkv');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=30:r=24',
      '-c:v',
      'libx264',
      '-g',
      '120',
      '-keyint_min',
      '120',
      '-sc_threshold',
      '0',
      file,
    ]);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    [7, 5],
    [12.5, 10],
    // FFmpeg backs its seek off with B-frames: just past a keyframe lands on the one before.
    [20.05, 15],
  ])('a seek to %s s starts near the keyframe at %s s', async (startSec, keyframe) => {
    const start = await createKeyframeProbe('ffmpeg')(file, startSec);

    expect(Math.abs(start - keyframe)).toBeLessThan(0.2);
  });
});
