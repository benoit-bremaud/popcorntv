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

  it('GET /health reports ok and nothing about the build (#92)', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /version gives a signed-in caller the running build', async () => {
    const response = await app.inject({ method: 'GET', url: '/version' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ version: '0.0.0-test' });
  });

  it('GET /version tells an anonymous caller nothing', async () => {
    const response = await app.inject({ method: 'GET', url: '/version', headers: { cookie: '' } });

    expect(response.statusCode).toBe(401);
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
  const MEDIA_LIMIT = LIMIT * 10;
  const ID = '00000000-0000-4000-8000-000000000000';
  let app: FastifyInstance;
  let db: AppDatabase;

  async function start(extra: Partial<AppOptions> = {}): Promise<void> {
    db = openDatabase(':memory:');
    app = await buildApp({ ...options(db), rateLimitMax: LIMIT, ...extra });
  }

  async function burst(
    url: string,
    count: number,
    request: {
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
      remoteAddress?: string;
    } = {},
  ): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < count; i += 1) {
      statuses.push((await app.inject({ method: 'GET', url, ...request })).statusCode);
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

  it('does not advertise the budget on ordinary answers', async () => {
    await start();

    const response = await app.inject({ method: 'GET', url: '/auth/status' });

    expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
  });

  it('counts unauthenticated and unmatched requests before the auth hook', async () => {
    await start();

    const statuses = await burst('/no-such-route', LIMIT + 1);

    expect(statuses).toEqual([...new Array<number>(LIMIT).fill(401), 429]);
  });

  it('throttles a signed-in caller on an API route', async () => {
    await start();
    sendCookie(app, createAccount(db).cookie);

    const statuses = await burst('/libraries', LIMIT + 1);

    expect(statuses).toEqual([...new Array<number>(LIMIT).fill(200), 429]);
  });

  it('keeps one bucket per client address', async () => {
    await start();
    expect((await burst('/auth/status', LIMIT + 1)).at(-1)).toBe(429);

    const other = await burst('/auth/status', 1, { remoteAddress: '192.0.2.7' });

    expect(other).toEqual([200]);
  });

  it('counts an IPv6 client by its /64', async () => {
    await start();
    for (let i = 1; i <= LIMIT; i += 1) {
      await burst('/auth/status', 1, { remoteAddress: `2001:db8:1:2::${i}` });
    }

    const sameNetwork = await burst('/auth/status', 1, { remoteAddress: '2001:db8:1:2::ff' });
    const otherNetwork = await burst('/auth/status', 1, { remoteAddress: '2001:db8:1:3::1' });

    expect(sameNetwork).toEqual([429]);
    expect(otherNetwork).toEqual([200]);
  });

  it.each([
    ['the health probe', 'GET', '/health'],
    ['an artwork file', 'GET', `/artwork/${'a'.repeat(64)}.jpg`],
    ['a direct-play range', 'GET', `/media/${ID}/file`],
    ['an HLS segment', 'GET', `/playback/sessions/${ID}/seg-00001.ts`],
    ['a subtitle track', 'GET', `/media/${ID}/subtitles/2`],
    ['the playback heartbeat', 'POST', `/playback/sessions/${ID}/heartbeat`],
  ] as const)('lets %s burst past the API limit', async (_case, method, url) => {
    await start();
    sendCookie(app, createAccount(db).cookie);

    const statuses = await burst(url, MEDIA_LIMIT, { method });

    expect(statuses).not.toContain(429);
    expect(statuses).not.toContain(401);
  });

  it('caps a media flood without a session in its own bucket', async () => {
    await start();

    const statuses = await burst(`/media/${ID}/file`, MEDIA_LIMIT + 1);

    expect(statuses.slice(0, MEDIA_LIMIT)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
  });

  it('keeps media requests out of the API budget', async () => {
    await start();
    await burst('/health', LIMIT * 4);

    const statuses = await burst('/auth/status', LIMIT);

    expect(statuses).not.toContain(429);
  });

  it('keys on the forwarded client only behind a trusted proxy', async () => {
    await start({ trustProxy: '127.0.0.1' });
    const first = await burst('/auth/status', LIMIT + 1, {
      headers: { 'x-forwarded-for': '198.51.100.1' },
    });
    expect(first.at(-1)).toBe(429);

    const other = await burst('/auth/status', 1, {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(other).toEqual([200]);
  });

  it('ignores a forged X-Forwarded-For from an untrusted peer', async () => {
    await start();
    await burst('/auth/status', LIMIT, { headers: { 'x-forwarded-for': '198.51.100.1' } });

    const forged = await burst('/auth/status', 1, {
      headers: { 'x-forwarded-for': '198.51.100.2' },
    });

    expect(forged).toEqual([429]);
  });
});
