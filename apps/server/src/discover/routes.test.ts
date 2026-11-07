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
import { TmdbRequestError } from '../metadata/tmdb-client.js';
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
  const app = Fastify();
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
  return { app, addFilm, advance: (ms: number) => (clock += ms) };
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

  it('memoises a list for 15 minutes', async () => {
    const client = makeClient();
    const { app, advance } = await setup(client);

    await app.inject({ url: '/discover?list=popular&kind=tv' });
    await app.inject({ url: '/discover?list=popular&kind=tv' });
    advance(LIST_TTL_MS);
    await app.inject({ url: '/discover?list=popular&kind=tv' });

    expect(client.list).toHaveBeenCalledTimes(2);
  });

  it('refuses bad queries, answers 409 without TMDB and 502 when TMDB fails', async () => {
    const { app } = await setup(
      makeClient({ list: vi.fn(async () => Promise.reject(new TmdbRequestError('/x', 500))) }),
    );
    const none = await setup(null);

    expect((await app.inject({ url: '/discover?list=new&kind=movie' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/discover/search?q=' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/discover?list=trending&kind=tv' })).json()).toEqual({
      error: 'tmdb_unavailable',
    });
    expect((await none.app.inject({ url: '/discover/search?q=a' })).statusCode).toBe(409);
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

    const poster = await app.inject({ url: '/discover/poster/dune.jpg' });
    const again = await app.inject({ url: '/discover/poster/dune.jpg' });
    const bad = await app.inject({ url: '/discover/poster/..%2Fx.jpg' });

    expect(poster.statusCode).toBe(200);
    expect(poster.headers['content-type']).toBe('image/jpeg');
    expect(again.rawPayload).toEqual(Buffer.from([0xff, 0xd8]));
    expect(client.image).toHaveBeenCalledTimes(1);
    expect(client.image).toHaveBeenCalledWith('/dune.jpg', 'w342');
    expect(bad.statusCode).toBe(400);
  });

  it('answers 404 when a poster cannot be downloaded', async () => {
    const { app } = await setup(
      makeClient({ image: vi.fn(async () => Promise.reject(new TmdbRequestError('/i', 404))) }),
    );

    expect((await app.inject({ url: '/discover/poster/x.jpg' })).statusCode).toBe(404);
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

  it('answers 502 when TMDB fails while adding', async () => {
    const { app } = await setup(
      makeClient({ details: vi.fn(async () => Promise.reject(new TmdbRequestError('/m', 500))) }),
    );

    const put = await app.inject({ method: 'PUT', url: '/profiles/default/wishlist/movie/1' });

    expect(put.statusCode).toBe(502);
  });
});
