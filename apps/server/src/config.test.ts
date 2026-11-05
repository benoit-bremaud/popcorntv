import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

/** The one required variable (spec auth R6). */
const BASE = { PUBLIC_URL: 'http://localhost:5173' };

describe('loadConfig', () => {
  it('uses the .env.example defaults when nothing is set, listening on loopback only', () => {
    expect(loadConfig(BASE)).toEqual({
      port: 3000,
      host: '127.0.0.1',
      databasePath: 'data/popcorntv.sqlite',
      mediaRoot: resolve('media'),
      ffprobePath: 'ffprobe',
      ffmpegPath: 'ffmpeg',
      transcodeDir: resolve('data/transcode'),
      transcodeMaxSessions: 1,
      tmdbApiKey: null,
      tmdbLanguage: 'en-US',
      artworkDir: resolve('data/artwork'),
      publicUrl: 'http://localhost:5173',
      trustProxy: false,
    });
  });

  it('reads every variable from the environment', () => {
    expect(
      loadConfig({
        PORT: '8080',
        HOST: '0.0.0.0',
        DATABASE_PATH: '/tmp/x.db',
        MEDIA_ROOT: '/m/../m',
        FFPROBE_PATH: '/bin/fp',
        FFMPEG_PATH: '/bin/ff',
        TRANSCODE_DIR: '/tmp/hls',
        TRANSCODE_MAX_SESSIONS: '3',
        TMDB_API_KEY: ' k3y ',
        TMDB_LANGUAGE: 'fr-FR',
        ARTWORK_DIR: '/tmp/art',
        PUBLIC_URL: ' https://tv.example.org/ ',
        TRUST_PROXY: '1',
      }),
    ).toEqual({
      port: 8080,
      host: '0.0.0.0',
      databasePath: '/tmp/x.db',
      mediaRoot: '/m',
      ffprobePath: '/bin/fp',
      ffmpegPath: '/bin/ff',
      transcodeDir: '/tmp/hls',
      transcodeMaxSessions: 3,
      tmdbApiKey: 'k3y',
      tmdbLanguage: 'fr-FR',
      artworkDir: '/tmp/art',
      publicUrl: 'https://tv.example.org',
      trustProxy: true,
    });
  });

  it.each(['0', '-2', 'abc', '1.5', 'Infinity'])(
    'falls back to one transcode at a time for %s',
    (value) => {
      expect(loadConfig({ ...BASE, TRANSCODE_MAX_SESSIONS: value }).transcodeMaxSessions).toBe(1);
    },
  );

  it('treats an empty key or the .env.example placeholder as no key', () => {
    expect(loadConfig({ ...BASE, TMDB_API_KEY: '' }).tmdbApiKey).toBeNull();
    expect(
      loadConfig({ ...BASE, TMDB_API_KEY: 'your-tmdb-read-access-token' }).tmdbApiKey,
    ).toBeNull();
  });

  it.each([
    [undefined, /PUBLIC_URL is required/],
    ['  ', /PUBLIC_URL is required/],
    ['localhost:5173', /absolute http\(s\) URL/],
    ['ftp://tv.example.org', /absolute http\(s\) URL/],
    ['https://tv.example.org/app', /origin only/],
    ['https://tv.example.org/?a=1', /origin only/],
    ['https://user:pw@tv.example.org', /origin only/],
  ])('refuses to start with PUBLIC_URL %j', (value, message) => {
    expect(() => loadConfig({ PUBLIC_URL: value })).toThrow(message);
  });

  it('trusts the proxy only for TRUST_PROXY=1', () => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: 'true' }).trustProxy).toBe(false);
  });
});
