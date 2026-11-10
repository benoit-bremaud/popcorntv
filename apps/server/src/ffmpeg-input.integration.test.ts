import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ffprobeArgs } from './library/ffprobe.js';

const execFileAsync = promisify(execFile);

/**
 * Opt-in (`FFMPEG_IT=1`): the real ffprobe refuses crafted library files that a playlist
 * demuxer would follow to the network or to another local file (ADR-0028), while a real
 * Matroska file still probes.
 */
describe.runIf(process.env['FFMPEG_IT'] === '1')('confined FFmpeg input', () => {
  let dir: string;
  let server: Server;
  let port = 0;
  let connections = 0;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'popcorntv-input-'));
    server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=d=1',
      '-c:v',
      'libx264',
      '-y',
      join(dir, 'ok.mkv'),
    ]);
  });

  afterAll(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('probes a real Matroska file', async () => {
    const { stdout } = await execFileAsync('ffprobe', ffprobeArgs(join(dir, 'ok.mkv')));
    expect(stdout).toContain('"codec_type": "video"');
  });

  it('refuses an HLS playlist named .mkv without connecting', async () => {
    const file = join(dir, 'remote.mkv');
    await writeFile(file, `#EXTM3U\n#EXTINF:1,\nhttp://127.0.0.1:${port}/x.ts\n#EXT-X-ENDLIST\n`);

    await expect(execFileAsync('ffprobe', ffprobeArgs(file))).rejects.toThrow();
    expect(connections).toBe(0);
  });

  it('refuses a concat list named .mkv that points at another local file', async () => {
    const file = join(dir, 'concat.mkv');
    await writeFile(file, `ffconcat version 1.0\nfile '${join(dir, 'ok.mkv')}'\n`);

    await expect(execFileAsync('ffprobe', ffprobeArgs(file))).rejects.toThrow();
  });
});
