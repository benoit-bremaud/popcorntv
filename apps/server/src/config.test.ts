import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, trustProxyWarning } from './config.js';

/** The one required variable (spec auth R6). */
const BASE = { PUBLIC_URL: 'http://localhost:5173' };

describe('loadConfig', () => {
  it.each([
    ['debug', 'debug'],
    [' WARN ', 'warn'],
    ['silent', 'silent'],
    ['', 'info'],
  ])('reads LOG_LEVEL %j as %s', (value, level) => {
    expect(loadConfig({ ...BASE, LOG_LEVEL: value }).logLevel).toBe(level);
  });

  it.each(['v1.2.0-rc.1', 'a1b2c3d', 'v0.3.0-4-ga1b2c3d'])('reads APP_VERSION %j', (value) => {
    expect(loadConfig({ ...BASE, APP_VERSION: ` ${value} ` }).appVersion).toBe(value);
  });

  it.each(['', '   '])('reads an empty APP_VERSION %j as dev', (value) => {
    expect(loadConfig({ ...BASE, APP_VERSION: value }).appVersion).toBe('dev');
  });

  it.each(['<script>', '-rf', 'x'.repeat(65)])('refuses APP_VERSION %j', (value) => {
    expect(() => loadConfig({ ...BASE, APP_VERSION: value })).toThrow('APP_VERSION must be');
  });

  it('refuses an unknown LOG_LEVEL rather than logging at a level no one chose', () => {
    expect(() => loadConfig({ ...BASE, LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL must be one of');
  });

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
      trustProxy: null,
      scanIntervalMin: 60,
      logLevel: 'info',
      appVersion: 'dev',
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
        TRUST_PROXY: '172.18.0.0/16, 10.0.0.2',
        SCAN_INTERVAL_MIN: '0',
        LOG_LEVEL: 'debug',
        APP_VERSION: 'v1.0.0',
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
      trustProxy: '172.18.0.0/16,10.0.0.2',
      scanIntervalMin: 0,
      logLevel: 'debug',
      appVersion: 'v1.0.0',
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

  it.each(['', '0', ' , '])('trusts no proxy for TRUST_PROXY=%j', (value) => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: value }).trustProxy).toBeNull();
  });

  it.each([
    ['::1', '::1'],
    ['fd00::/8', 'fd00::/8'],
    ['192.168.1.10/32', '192.168.1.10/32'],
    ['10.0.0.2,', '10.0.0.2'],
  ])('accepts TRUST_PROXY=%j', (value, expected) => {
    expect(loadConfig({ ...BASE, TRUST_PROXY: value }).trustProxy).toBe(expected);
  });

  it.each([
    '1',
    'true',
    '10.0.0.0/33',
    'fd00::/129',
    '10.0.0.0/8/1',
    '10.0.0.0/x',
    '10.0.0.0/08',
    '10.0.0.0/0',
    '::/0',
    'caddy',
  ])(
    'refuses to start with TRUST_PROXY=%j, which would trust any peer or nothing meant',
    (value) => {
      expect(() => loadConfig({ ...BASE, TRUST_PROXY: value })).toThrow(/addresses or CIDRs/);
    },
  );

  it.each([
    ['https://tv.example.org', null, true],
    ['https://tv.example.org', '172.18.0.10', false],
    ['http://localhost:5173', null, false],
  ])('warns for PUBLIC_URL %j and TRUST_PROXY %j: %j', (publicUrl, trustProxy, warns) => {
    expect(trustProxyWarning({ publicUrl, trustProxy }) !== null).toBe(warns);
  });
});

describe('SCAN_INTERVAL_MIN', () => {
  it.each(['-5', '1.5', 'often', ' ', '40000'])('should fall back to 60 for %j', (value) => {
    expect(loadConfig({ ...BASE, SCAN_INTERVAL_MIN: value }).scanIntervalMin).toBe(60);
  });

  it('should accept the largest interval a timer can hold', () => {
    expect(loadConfig({ ...BASE, SCAN_INTERVAL_MIN: '35791' }).scanIntervalMin).toBe(35791);
  });
});
