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
 * Opt-in (`FFMPEG_IT=1`): the real ffprobe refuses, with \"not on whitelist\", crafted library
 * files a manifest or concat demuxer would follow (ADR-0028), while a real Matroska file
 * still probes. The concat control shows the protocol whitelist alone does not stop it.
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

  it('confines a sibling concat list that the protocol whitelist alone lets through', async () => {
    const file = join(dir, 'concat.mkv');
    // A relative sibling passes concat's `safe=1`: the format whitelist is what stops it.
    await writeFile(file, "ffconcat version 1.0\nfile 'ok.mkv'\n");

    const protocolOnly = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=format_name',
      '-of',
      'csv=p=0',
      '-protocol_whitelist',
      'file',
      '-i',
      file,
    ]);
    expect(protocolOnly.stdout.trim()).toBe('concat');
    await expect(execFileAsync('ffprobe', ffprobeArgs(file))).rejects.toThrow(/not on whitelist/);
  });

  it('refuses a DASH manifest named .mkv without connecting', async () => {
    const file = join(dir, 'remote.mkv');
    await writeFile(
      file,
      `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT1S" minBufferTime="PT1S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011"><Period><AdaptationSet mimeType="video/mp4"><Representation id="1" bandwidth="1"><BaseURL>http://127.0.0.1:${port}/x.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`,
    );

    await expect(execFileAsync('ffprobe', ffprobeArgs(file))).rejects.toThrow(/not on whitelist/);
    expect(connections).toBe(0);
  });
});
