import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import type { AppOptions } from './app.js';
import { openDatabase } from './db/index.js';
import type { AppDatabase } from './db/index.js';
import { createAccount, sendCookie, testAuthOptions } from './test-fixtures.js';

const LIMIT = 3;

function options(db: AppDatabase): AppOptions {
  return {
    version: '0.0.0-test',
    db,
    probe: async () => ({ durationSec: null, streams: [] }),
    mediaRoot: tmpdir(),
    tmdb: null,
    artworkDir: tmpdir(),
    transcoder: () => {
      throw new Error('FFmpeg is not used by this suite');
    },
    transcodeDir: tmpdir(),
    ...testAuthOptions,
  };
}

describe('buildApp', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const db = openDatabase(':memory:');
    app = await buildApp(options(db));
    sendCookie(app, createAccount(db).cookie);
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health reports ok with the running version', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: '0.0.0-test' });
  });

  it('answers 500 { error: internal } without echoing an unexpected error', async () => {
    app.get('/boom', async () => {
      throw new Error('SQLITE_CONSTRAINT: secret detail');
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal' });
    expect(response.body).not.toContain('secret');
  });

  it('maps a malformed JSON body to 400 invalid_request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
  });

  it.each([
    ['a success', '/health', 200],
    ['a not found', '/no-such-route', 404],
    ['a rejected artwork name', '/artwork/..%2Fsecret', 400],
    ['an unexpected error', '/boom', 500],
  ])('sends the security headers on %s', async (_case, url, status) => {
    app.get('/boom', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(status);
    expect(response.headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      'cache-control': 'no-store',
    });
  });

  it('keeps a cache policy the route chose itself', async () => {
    app.get('/cached', async (_request, reply) => reply.header('cache-control', 'private').send());

    const response = await app.inject({ method: 'GET', url: '/cached' });

    expect(response.headers['cache-control']).toBe('private');
  });
});

describe('global rate limit (spec auth R13)', () => {
  let app: FastifyInstance;
  let db: AppDatabase;

  async function start(extra: Partial<AppOptions> = {}): Promise<void> {
    db = openDatabase(':memory:');
    app = await buildApp({ ...options(db), rateLimitMax: LIMIT, ...extra });
  }

  async function burst(url: string, count: number, headers: Record<string, string> = {}) {
    const statuses: number[] = [];
    for (let i = 0; i < count; i += 1) {
      statuses.push((await app.inject({ method: 'GET', url, headers })).statusCode);
    }
    return statuses;
  }

  afterEach(async () => {
    await app.close();
  });

  it('answers 429 too_many_requests with retry-after past the limit', async () => {
    await start();
    await burst('/auth/status', LIMIT);

    const response = await app.inject({ method: 'GET', url: '/auth/status' });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: 'too_many_requests' });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('counts unauthenticated and unmatched requests before the auth hook', async () => {
    await start();

    const statuses = await burst('/no-such-route', LIMIT + 1);

    expect(statuses).toEqual([...new Array<number>(LIMIT).fill(401), 429]);
  });

  it('keeps one bucket per client address', async () => {
    await start();
    await burst('/auth/status', LIMIT + 1);

    const other = await app.inject({
      method: 'GET',
      url: '/auth/status',
      remoteAddress: '192.0.2.7',
    });

    expect(other.statusCode).toBe(200);
  });

  it.each([
    ['the health probe', '/health'],
    ['an artwork file', `/artwork/${'a'.repeat(64)}.jpg`],
    ['a direct-play range', '/media/00000000-0000-4000-8000-000000000000/file'],
    ['an HLS segment', '/playback/sessions/00000000-0000-4000-8000-000000000000/seg-00001.ts'],
    ['a subtitle track', '/media/00000000-0000-4000-8000-000000000000/subtitles/2'],
  ])('never throttles %s', async (_case, url) => {
    await start();
    sendCookie(app, createAccount(db).cookie);

    const statuses = await burst(url, LIMIT * 4);

    expect(statuses).not.toContain(429);
    expect(statuses).not.toContain(401);
  });

  it('never throttles the playback heartbeat', async () => {
    await start();
    sendCookie(app, createAccount(db).cookie);
    const url = '/playback/sessions/00000000-0000-4000-8000-000000000000/heartbeat';

    const statuses: number[] = [];
    for (let i = 0; i < LIMIT * 4; i += 1) {
      statuses.push((await app.inject({ method: 'POST', url })).statusCode);
    }

    expect(statuses).not.toContain(429);
    expect(statuses).not.toContain(401);
  });

  it('keys on the forwarded client only behind a trusted proxy', async () => {
    await start({ trustProxy: '127.0.0.1' });
    await burst('/auth/status', LIMIT + 1, { 'x-forwarded-for': '198.51.100.1' });

    const other = await app.inject({
      method: 'GET',
      url: '/auth/status',
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(other.statusCode).toBe(200);
  });

  it('ignores a forged X-Forwarded-For from an untrusted peer', async () => {
    await start();
    await burst('/auth/status', LIMIT, { 'x-forwarded-for': '198.51.100.1' });

    const forged = await app.inject({
      method: 'GET',
      url: '/auth/status',
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(forged.statusCode).toBe(429);
  });
});
