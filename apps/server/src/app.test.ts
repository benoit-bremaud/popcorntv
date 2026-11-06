import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { openDatabase } from './db/index.js';
import { createAccount, sendCookie, testAuthOptions } from './test-fixtures.js';

describe('buildApp', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    const db = openDatabase(':memory:');
    app = buildApp({
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
    });
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
