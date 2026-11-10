import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { DiscoverDetails, DiscoverTitle, WishlistEntry } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { libraries, media } from '../db/schema.js';
import { ArtworkCache } from '../metadata/artwork-cache.js';
import { createTmdbClient, TmdbRequestError } from '../metadata/tmdb-client.js';
import type { TmdbClient, TmdbSummary } from '../metadata/tmdb-client.js';
import { ProfileRepository } from '../profiles/repository.js';
import { actAs, createAccount } from '../test-fixtures.js';
import { LIST_TTL_MS, registerDiscoverRoutes } from './routes.js';
import { WishlistRepository } from './wishlist-repository.js';

const DUNE: TmdbSummary = {
  kind: 'movie',
  id: 438631,
  title: 'Dune',
  year: 2021,
  overview: 'Spice.',
  vote_average: 7.8,
  poster_path: '/dune.jpg',
};

function makeClient(overrides: Partial<TmdbClient> = {}): TmdbClient {
  return {
    search: vi.fn(async () => []),
    findByImdb: vi.fn(async () => []),
    details: vi.fn<TmdbClient['details']>(async (_kind, id) => ({
      id,
      title: 'Dune',
      overview: 'Spice.',
      genres: [{ id: 878, name: 'Science Fiction' }],
      date: '2021-09-15',
      runtimeMin: 155,
      vote_average: 7.8,
      vote_count: 10,
      poster_path: '/dune.jpg',
      backdrop_path: null,
      cast: [
        { name: 'Zendaya', character: 'Chani', profile_path: null, order: 1 },
        { name: 'Timothée Chalamet', character: 'Paul', profile_path: null, order: 0 },
      ],
    })),
    season: vi.fn(async () => []),
    list: vi.fn<TmdbClient['list']>(async () => [DUNE]),
    searchTitles: vi.fn<TmdbClient['searchTitles']>(async () => [DUNE]),
    image: vi.fn(async () => new Uint8Array([0xff, 0xd8])),
    ...overrides,
  };
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setup(client: TmdbClient | null = makeClient()) {
  const db = openDatabase(':memory:');
  const owner = createAccount(db);
  const artworkDir = await mkdtemp(join(tmpdir(), 'popcorntv-discover-'));
  dirs.push(artworkDir);
  let clock = 0;
  /**
   * Unexpected warn-level and worse lines: a handler that throws or sends again after replying
   * (#178). The expected `discover.tmdb.failed` lines (spec logging) go to `tmdbFailures`.
   */
  const failures: string[] = [];
  const tmdbFailures: string[] = [];
  /** Expected `discover.list.warm_failed` / `refresh_failed` lines (ADR-0027). */
  const listFailures: string[] = [];
  const app = Fastify({
    logger: {
      level: 'warn',
      stream: {
        write: (line: string) => {
          if (line.includes('"event":"discover.tmdb.failed"')) tmdbFailures.push(line);
          else if (line.includes('"event":"discover.list.')) listFailures.push(line);
          else failures.push(line);
        },
      },
    },
  });
  actAs(app, () => ({ userId: owner.userId, role: 'owner', sessionId: owner.sessionId }));
  registerDiscoverRoutes(app, {
    tmdb: client,
    artwork: client ? new ArtworkCache(artworkDir, client) : null,
    artworkDir,
    wishlist: new WishlistRepository(db),
    profiles: new ProfileRepository(db),
    now: () => clock,
  });
  const libraryId = randomUUID();
  db.insert(libraries)
    .values({ id: libraryId, name: 'Films', rootPath: '/m', kind: 'films', createdAt: '' })
    .run();
  /** A scanned and enriched local film carrying `tmdbId`. */
  const addFilm = (tmdbId: number): string => {
    const id = randomUUID();
    db.insert(media).values({ id, libraryId, kind: 'film', title: 'Dune', tmdbId }).run();
    return id;
  };
  // The warm-up runs on ready (ADR-0027): let it settle, then count only the test's own calls.
  await app.ready();
  await settle();
  if (client && vi.isMockFunction(client.list)) vi.mocked(client.list).mockClear();
  return {
    app,
    db,
    failures,
    tmdbFailures,
    listFailures,
    addFilm,
    advance: (ms: number) => (clock += ms),
  };
}

/** Lets the background TMDB calls (warm-up, refresh) finish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('discover routes', () => {
  it('lists a TMDB row with the local media id when the title is on disk', async () => {
    const { app, addFilm } = await setup();
    const mediaId = addFilm(DUNE.id);

    const response = await app.inject({ url: '/discover?list=trending&kind=movie' });

    expect(response.statusCode).toBe(200);
    expect(response.json<DiscoverTitle[]>()).toEqual([
      {
        kind: 'movie',
        tmdbId: DUNE.id,
        title: 'Dune',
        year: 2021,
        overview: 'Spice.',
        voteAverage: 7.8,
        posterPath: '/dune.jpg',
        mediaId,
      },
    ]);
  });

  it('warms the four lists at start, so the first visit makes no TMDB call', async () => {
    const client = makeClient();
    const { app } = await setup(client);

    const response = await app.inject({ url: '/discover?list=popular&kind=tv' });

    expect(response.json<DiscoverTitle[]>()).toHaveLength(1);
    expect(client.list).not.toHaveBeenCalled();
  });

  it('calls every list once at start', async () => {
    const calls: [string, string][] = [];
    // A plain function: `setup` clears mocked `list` calls once the warm-up has run.
    await setup(
      makeClient({
        list: async (list, of) => {
          calls.push([list, of]);
          return [DUNE];
        },
      }),
    );

    expect(calls).toEqual([
      ['trending', 'movie'],
      ['trending', 'tv'],
      ['popular', 'movie'],
      ['popular', 'tv'],
    ]);
  });

  it('serves a list fresh for 15 minutes, then stale while one call refreshes it', async () => {
    const client = makeClient();
    const { app, advance } = await setup(client);
    const url = '/discover?list=popular&kind=tv';

    advance(LIST_TTL_MS - 1);
    await app.inject({ url });
    expect(client.list).not.toHaveBeenCalled();

    vi.mocked(client.list).mockResolvedValueOnce([{ ...DUNE, title: 'Dune: Part Two' }]);
    advance(1);
    const stale = await app.inject({ url });
    await settle();
    const fresh = await app.inject({ url });

    expect(stale.json<DiscoverTitle[]>()[0]?.title).toBe('Dune');
    expect(fresh.json<DiscoverTitle[]>()[0]?.title).toBe('Dune: Part Two');
    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh between concurrent visits of a stale list', async () => {
    const client = makeClient();
    const { app, advance } = await setup(client);
    advance(LIST_TTL_MS);

    await Promise.all([
      app.inject({ url: '/discover?list=trending&kind=movie' }),
      app.inject({ url: '/discover?list=trending&kind=movie' }),
    ]);
    await settle();

    expect(client.list).toHaveBeenCalledTimes(1);
  });

  it('keeps serving the stale list and logs when the refresh fails', async () => {
    const client = makeClient();
    const { app, advance, failures, listFailures } = await setup(client);
    vi.mocked(client.list).mockRejectedValue(new TmdbRequestError('/x', 500));
    advance(LIST_TTL_MS);

    const first = await app.inject({ url: '/discover?list=trending&kind=movie' });
    await settle();
    const second = await app.inject({ url: '/discover?list=trending&kind=movie' });
    await settle();

    expect(first.json<DiscoverTitle[]>()).toHaveLength(1);
    expect(second.json<DiscoverTitle[]>()).toHaveLength(1);
    expect(listFailures).toHaveLength(2);
    expect(listFailures[0]).toContain('"event":"discover.list.refresh_failed"');
    expect(failures).toEqual([]);
  });

  it('waits for TMDB on the first visit when the warm-up failed, and logs the failure', async () => {
    const list = vi
      .fn<TmdbClient['list']>()
      .mockRejectedValueOnce(new TmdbRequestError('/x', 500))
      .mockResolvedValue([DUNE]);
    const { app, failures, listFailures } = await setup(makeClient({ list }));

    const response = await app.inject({ url: '/discover?list=trending&kind=movie' });

    expect(response.statusCode).toBe(200);
    expect(response.json<DiscoverTitle[]>()).toHaveLength(1);
    expect(listFailures).toHaveLength(1);
    expect(listFailures[0]).toContain('"event":"discover.list.warm_failed"');
    expect(failures).toEqual([]);
  });

  it('refuses bad queries, answers 409 without TMDB and 502 when TMDB fails', async () => {
    const { app, failures, tmdbFailures } = await setup(
      makeClient({
        list: vi.fn(async () => Promise.reject(new TmdbRequestError('/x', 500))),
        searchTitles: vi.fn(async () => Promise.reject(new TmdbRequestError('/s', 500))),
        details: vi.fn(async () => Promise.reject(new TmdbRequestError('/m', 500))),
      }),
    );
    const none = await setup(null);

    expect((await app.inject({ url: '/discover?list=new&kind=movie' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/discover/search?q=' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/discover?list=trending&kind=tv' })).json()).toEqual({
      error: 'tmdb_unavailable',
    });
    expect((await app.inject({ url: '/discover/search?q=a' })).json()).toEqual({
      error: 'tmdb_unavailable',
    });
    expect((await app.inject({ url: '/discover/movie/1' })).statusCode).toBe(502);
    expect((await none.app.inject({ url: '/discover/search?q=a' })).statusCode).toBe(409);
    expect(failures).toEqual([]);
    expect(tmdbFailures.length).toBeGreaterThan(0);
  });

  it('searches titles and returns the title sheet with the first billed cast', async () => {
    const { app } = await setup();

    const search = await app.inject({ url: '/discover/search?q=dune' });
    const sheet = await app.inject({ url: `/discover/movie/${DUNE.id}` });

    expect(search.json<DiscoverTitle[]>().map((title) => title.title)).toEqual(['Dune']);
    expect(sheet.json<DiscoverDetails>()).toMatchObject({
      tmdbId: DUNE.id,
      genres: ['Science Fiction'],
      cast: ['Timothée Chalamet', 'Zendaya'],
      mediaId: null,
    });
  });

  it('serves a Discover poster through the artwork cache and refuses odd names', async () => {
    const client = makeClient();
    const { app } = await setup(client);
    await app.inject({ url: '/discover?list=trending&kind=movie' }); // Hands out /dune.jpg.

    const poster = await app.inject({ url: '/discover/poster/dune.jpg' });
    const again = await app.inject({ url: '/discover/poster/dune.jpg' });
    const bad = await app.inject({ url: '/discover/poster/..%2Fx.jpg' });

    expect(poster.statusCode).toBe(200);
    expect(poster.headers['content-type']).toBe('image/jpeg');
    expect(poster.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(again.rawPayload).toEqual(Buffer.from([0xff, 0xd8]));
    expect(client.image).toHaveBeenCalledTimes(1);
    expect(client.image).toHaveBeenCalledWith('/dune.jpg', 'w342');
    expect(bad.statusCode).toBe(400);
  });

  it('answers 404 when a poster cannot be downloaded', async () => {
    const { app } = await setup(
      makeClient({ image: vi.fn(async () => Promise.reject(new TmdbRequestError('/i', 404))) }),
    );

    await app.inject({ url: '/discover/search?q=dune' });

    expect((await app.inject({ url: '/discover/poster/dune.jpg' })).statusCode).toBe(404);
  });

  it('never downloads a poster path it did not hand out', async () => {
    const client = makeClient();
    const { app } = await setup(client);

    const poster = await app.inject({ url: '/discover/poster/other.jpg' });

    expect(poster.json()).toEqual({ error: 'artwork_not_found' });
    expect(client.image).not.toHaveBeenCalled();
  });

  it('answers 404 title_not_found when TMDB does not know the id', async () => {
    const { app, failures } = await setup(
      makeClient({ details: vi.fn(async () => Promise.reject(new TmdbRequestError('/m', 404))) }),
    );

    const sheet = await app.inject({ url: '/discover/movie/999' });
    const put = await app.inject({ method: 'PUT', url: '/profiles/default/wishlist/movie/999' });

    expect([sheet.statusCode, put.statusCode]).toEqual([404, 404]);
    expect(sheet.json()).toEqual({ error: 'title_not_found' });
    expect(failures).toEqual([]); // #178: the handler stops once the answer is sent.
  });
});

describe('wishlist routes', () => {
  it('adds a title from TMDB facts, lists it, then shows it available once scanned', async () => {
    const { app, addFilm } = await setup();

    const put = await app.inject({
      method: 'PUT',
      url: `/profiles/default/wishlist/movie/${DUNE.id}`,
    });
    const before = await app.inject({ url: '/profiles/default/wishlist' });
    const mediaId = addFilm(DUNE.id);
    const after = await app.inject({ url: '/profiles/default/wishlist' });

    expect(put.statusCode).toBe(204);
    expect(before.json<WishlistEntry[]>()).toMatchObject([
      { kind: 'movie', tmdbId: DUNE.id, title: 'Dune', year: 2021, mediaId: null },
    ]);
    expect(after.json<WishlistEntry[]>()[0]?.mediaId).toBe(mediaId);
  });

  it('does not match a series with the same id as a film', async () => {
    const { app, addFilm } = await setup();
    addFilm(DUNE.id);

    await app.inject({ method: 'PUT', url: `/profiles/default/wishlist/tv/${DUNE.id}` });

    expect((await app.inject({ url: '/profiles/default/wishlist' })).json()).toMatchObject([
      { kind: 'tv', mediaId: null },
    ]);
  });

  it('removes a title, idempotently', async () => {
    const { app } = await setup();
    const url = `/profiles/default/wishlist/movie/${DUNE.id}`;
    await app.inject({ method: 'PUT', url });

    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect((await app.inject({ url: '/profiles/default/wishlist' })).json()).toEqual([]);
  });

  it('refuses an unknown profile, a bad kind, and adding without TMDB', async () => {
    const { app } = await setup();
    const none = await setup(null);

    expect((await app.inject({ url: `/profiles/${randomUUID()}/wishlist` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/profiles/${randomUUID()}/wishlist/movie/1` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: `/profiles/${randomUUID()}/wishlist/movie/1` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: '/profiles/default/wishlist/book/1' })).statusCode,
    ).toBe(400);
    expect(
      (await none.app.inject({ method: 'PUT', url: '/profiles/default/wishlist/movie/1' }))
        .statusCode,
    ).toBe(409);
    expect((await none.app.inject({ url: '/profiles/default/wishlist' })).statusCode).toBe(200);
  });

  it("refuses another account's profile", async () => {
    const { app, db } = await setup();
    const other = createAccount(db, 'neighbour', 'viewer');
    const [theirs] = new ProfileRepository(db).list(other.userId);
    if (theirs === undefined) throw new Error('profile missing');
    const url = `/profiles/${theirs.id}/wishlist`;

    expect((await app.inject({ url })).statusCode).toBe(404);
    expect((await app.inject({ method: 'PUT', url: `${url}/movie/1` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${url}/movie/1` })).statusCode).toBe(404);
  });

  it('answers 502 when TMDB fails while adding', async () => {
    const { app, failures, tmdbFailures } = await setup(
      makeClient({ details: vi.fn(async () => Promise.reject(new TmdbRequestError('/m', 500))) }),
    );

    const put = await app.inject({ method: 'PUT', url: '/profiles/default/wishlist/movie/1' });

    expect(put.statusCode).toBe(502);
    expect(failures).toEqual([]);
    expect(tmdbFailures.length).toBeGreaterThan(0);
  });

  describe('with the real client over a broken TMDB (#179)', () => {
    const broken: [string, () => Promise<Response>][] = [
      ['a non-JSON body', async () => new Response('<html>oops</html>')],
      ['a JSON body of the wrong shape', async () => Response.json({ id: 'one', results: 3 })],
      ['a network failure', async () => Promise.reject(new TypeError('fetch failed'))],
      ['a timeout', async () => Promise.reject(new DOMException('slow', 'TimeoutError'))],
    ];

    it.each(broken)('answers 502 tmdb_unavailable on %s', async (_label, answer) => {
      const client = createTmdbClient({
        apiKey: 'tmdb-secret-test-key',
        language: 'en-US',
        fetch: vi.fn(answer),
      });
      const { app, failures, tmdbFailures } = await setup(client);

      const routes = [
        { method: 'GET' as const, url: '/discover?list=trending&kind=movie' },
        { method: 'GET' as const, url: '/discover/search?q=dune' },
        { method: 'GET' as const, url: '/discover/movie/1' },
        { method: 'PUT' as const, url: '/profiles/default/wishlist/movie/1' },
      ];
      for (const route of routes) {
        const response = await app.inject(route);
        expect(response.statusCode, route.url).toBe(502);
        expect(response.json(), route.url).toEqual({ error: 'tmdb_unavailable' });
      }

      expect(failures).toEqual([]);
      expect(tmdbFailures).toHaveLength(routes.length);
      expect(tmdbFailures.join('\n')).not.toContain('tmdb-secret-test-key');
      expect((await app.inject({ url: '/profiles/default/wishlist' })).json()).toEqual([]);
    });
  });
});
