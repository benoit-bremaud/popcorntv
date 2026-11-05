import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiError, Library, Media, StreamInfo } from '@popcorntv/shared';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import type { Transcoder } from './transcoder.js';
import { createAccount, sendCookie, testAuthOptions } from '../test-fixtures.js';

const VTT =
  'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nEarly\n\n00:00:20.000 --> 00:00:22.000\nLate\n';

function stream(type: StreamInfo['type'], codec: string): StreamInfo {
  return { type, codec, width: null, height: null, language: null };
}

describe('GET /media/:id/subtitles/:index', () => {
  let app: FastifyInstance;
  let base: string;
  let root: string;
  let exitCode: number;
  let transcoder: ReturnType<typeof vi.fn<Transcoder>>;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'popcorntv-subtitle-routes-'));
    root = join(base, 'media', 'films');
    await mkdir(root, { recursive: true });
    exitCode = 0;
    transcoder = vi.fn<Transcoder>((args, onExit) => {
      if (exitCode === 0) writeFileSync(args.at(-1) ?? '', VTT);
      queueMicrotask(() => onExit(exitCode, 'bad stream'));
      return { kill: vi.fn() };
    });
    const db = openDatabase(':memory:');
    app = buildApp({
      version: 'test',
      db,
      probe: async () => ({
        durationSec: 60,
        streams: [
          stream('video', 'h264'),
          stream('subtitle', 'hdmv_pgs_subtitle'),
          stream('subtitle', 'subrip'),
        ],
      }),
      mediaRoot: join(base, 'media'),
      tmdb: null,
      artworkDir: join(base, 'artwork'),
      transcoder,
      transcodeDir: join(base, 'transcode'),
      ...testAuthOptions,
    });
    sendCookie(app, createAccount(db).cookie);
  });

  afterEach(async () => {
    await app.close();
    await rm(base, { recursive: true, force: true });
  });

  async function scanned(): Promise<Media> {
    await writeFile(join(root, 'Heat (1995).mkv'), 'not a real film');
    const library = (
      await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: 'Films', rootPath: root, kind: 'films' },
      })
    ).json<Library>();
    await app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });
    const list = await app.inject({ method: 'GET', url: `/libraries/${library.id}/media` });
    const [item] = list.json<Media[]>();
    if (item === undefined) throw new Error('not scanned');
    return item;
  }

  it('extracts once and shifts the cached track per request', async () => {
    const film = await scanned();

    const raw = await app.inject({ url: `/media/${film.id}/subtitles/1` });
    const shifted = await app.inject({ url: `/media/${film.id}/subtitles/1?offsetSec=10` });

    expect(raw.statusCode).toBe(200);
    expect(raw.headers['content-type']).toBe('text/vtt; charset=utf-8');
    expect(raw.body).toBe(VTT);
    expect(shifted.body).toBe('WEBVTT\n\n00:00:10.000 --> 00:00:12.000\nLate\n');
    expect(transcoder).toHaveBeenCalledTimes(1);
    expect(transcoder.mock.calls[0]?.[0]).toContain('0:s:1');
  });

  it.each([
    ['an image track', 0],
    ['a missing track', 2],
  ])('answers 404 subtitle_not_found for %s without running FFmpeg', async (_label, index) => {
    const film = await scanned();

    const response = await app.inject({ url: `/media/${film.id}/subtitles/${index}` });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiError>().error).toBe('subtitle_not_found');
    expect(transcoder).not.toHaveBeenCalled();
  });

  it('answers 404 media_not_found when the file now escapes the media root', async () => {
    const film = await scanned();
    const outside = join(base, 'secret.mkv');
    await writeFile(outside, 'secret');
    await unlink(join(root, 'Heat (1995).mkv'));
    await symlink(outside, join(root, 'Heat (1995).mkv'));

    const response = await app.inject({ url: `/media/${film.id}/subtitles/1` });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiError>().error).toBe('media_not_found');
    expect(transcoder).not.toHaveBeenCalled();
  });

  it('answers 404 media_not_found for an unknown media', async () => {
    const response = await app.inject({
      url: '/media/7b0f4f8e-0b5e-4a63-9f39-2c6f3b3e7a11/subtitles/1',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiError>().error).toBe('media_not_found');
  });

  it.each([
    '/media/nope/subtitles/1',
    '/media/7b0f4f8e-0b5e-4a63-9f39-2c6f3b3e7a11/subtitles/-1',
    '/media/7b0f4f8e-0b5e-4a63-9f39-2c6f3b3e7a11/subtitles/abc',
    '/media/7b0f4f8e-0b5e-4a63-9f39-2c6f3b3e7a11/subtitles/1.5',
  ])('answers 400 for %s', async (url) => {
    expect((await app.inject({ url })).statusCode).toBe(400);
  });

  it.each(['-3', '1.5', 'x'])('answers 400 for offsetSec=%s', async (offset) => {
    const film = await scanned();

    const response = await app.inject({ url: `/media/${film.id}/subtitles/1?offsetSec=${offset}` });

    expect(response.statusCode).toBe(400);
  });

  it('answers 500 transcode_failed when FFmpeg fails', async () => {
    const film = await scanned();
    exitCode = 1;

    const response = await app.inject({ url: `/media/${film.id}/subtitles/1` });

    expect(response.statusCode).toBe(500);
    expect(response.json<ApiError>().error).toBe('transcode_failed');
  });
});
