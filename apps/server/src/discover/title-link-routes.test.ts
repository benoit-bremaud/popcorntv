import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { Role, TitleLink } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { actAs, createAccount } from '../test-fixtures.js';
import { TitleLinkRepository } from './title-link-repository.js';
import { registerTitleLinkRoutes } from './title-link-routes.js';

const URL_PATH = '/title-links/movie/603';

async function setup(role: Role = 'owner') {
  const db = openDatabase(':memory:');
  const account = createAccount(db);
  const links = new TitleLinkRepository(db);
  const logs: Record<string, unknown>[] = [];
  const app = Fastify({
    logger: { level: 'info', stream: { write: (line: string) => logs.push(JSON.parse(line)) } },
  });
  actAs(app, () => ({ userId: account.userId, role, sessionId: account.sessionId }));
  registerTitleLinkRoutes(app, { links });
  await app.ready();
  return { app, links, logs };
}

describe('title link routes', () => {
  it('should store a valid link, normalised, and answer it with editable for an owner', async () => {
    const t = await setup();

    const put = await t.app.inject({
      method: 'PUT',
      url: URL_PATH,
      payload: { url: ' https://Example.org/watch ' },
    });
    const get = (await t.app.inject({ url: URL_PATH })).json<TitleLink>();

    expect(put.statusCode).toBe(204);
    expect(get).toEqual({ url: 'https://example.org/watch', editable: true });
  });

  it('should replace an existing link', async () => {
    const t = await setup();
    t.links.set('movie', 603, 'https://old.example/');

    await t.app.inject({ method: 'PUT', url: URL_PATH, payload: { url: 'https://new.example/' } });

    expect(t.links.get('movie', 603)).toBe('https://new.example/');
  });

  it('should answer a null url and editable false to a viewer', async () => {
    const t = await setup('viewer');

    const get = (await t.app.inject({ url: '/title-links/tv/1399' })).json<TitleLink>();

    expect(get).toEqual({ url: null, editable: false });
  });

  it('should keep links apart per kind', async () => {
    const t = await setup();
    t.links.set('movie', 603, 'https://film.example/');

    const tv = (await t.app.inject({ url: '/title-links/tv/603' })).json<TitleLink>();

    expect(tv.url).toBeNull();
  });

  it.each([
    ['javascript', { url: 'javascript:alert(1)' }],
    ['data', { url: 'data:text/html,x' }],
    ['credentials', { url: 'https://u:p@example.org/' }],
    ['too long', { url: `https://example.org/${'a'.repeat(3000)}` }],
    ['not a string', { url: 42 }],
    ['missing', {}],
  ])('should refuse a %s link with 400 and store nothing', async (_label, payload) => {
    const t = await setup();

    const put = await t.app.inject({ method: 'PUT', url: URL_PATH, payload });

    expect(put.statusCode).toBe(400);
    expect(put.json()).toMatchObject({ error: 'invalid_request' });
    expect(t.links.get('movie', 603)).toBeNull();
  });

  it.each([
    ['GET', '/title-links/episode/603'],
    ['GET', '/title-links/movie/0'],
    ['PUT', '/title-links/movie/abc'],
    ['DELETE', '/title-links/person/1'],
  ] as const)('should refuse bad params on %s %s with 400', async (method, url) => {
    const t = await setup();

    const response = await t.app.inject({
      method,
      url,
      payload: method === 'PUT' ? { url: 'https://example.org/' } : undefined,
    });

    expect(response.statusCode).toBe(400);
  });

  it('should remove a link, then answer 204 again when there is none', async () => {
    const t = await setup();
    t.links.set('movie', 603, 'https://example.org/');

    const first = await t.app.inject({ method: 'DELETE', url: URL_PATH });
    const second = await t.app.inject({ method: 'DELETE', url: URL_PATH });

    expect(first.statusCode).toBe(204);
    expect(second.statusCode).toBe(204);
    expect(t.links.get('movie', 603)).toBeNull();
  });

  it('should log set and removed events without the URL', async () => {
    const t = await setup();

    await t.app.inject({
      method: 'PUT',
      url: URL_PATH,
      payload: { url: 'https://example.org/?token=secret' },
    });
    await t.app.inject({ method: 'DELETE', url: URL_PATH });
    await t.app.inject({ method: 'DELETE', url: URL_PATH });

    const events = t.logs.filter((line) => typeof line.event === 'string');
    expect(events.map((line) => line.event)).toEqual(['title_link.set', 'title_link.removed']);
    expect(events[0]).toMatchObject({ kind: 'movie', tmdbId: 603 });
    expect(JSON.stringify(t.logs)).not.toContain('secret');
  });
});
