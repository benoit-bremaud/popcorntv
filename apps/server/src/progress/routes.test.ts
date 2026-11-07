import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { MediaKind, WatchProgress } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { libraries, media } from '../db/schema.js';
import { ProfileRepository } from '../profiles/repository.js';
import { actAs, createAccount } from '../test-fixtures.js';
import { ProgressRepository } from './repository.js';
import { registerProgressRoutes } from './routes.js';

/** An in-memory database with one library; `addMedia` inserts a row and returns its id. */
function progressDb(): {
  readonly db: AppDatabase;
  readonly addMedia: (kind: MediaKind, durationSec: number | null) => string;
} {
  const db = openDatabase(':memory:');
  const libraryId = randomUUID();
  db.insert(libraries)
    .values({ id: libraryId, name: 'Films', rootPath: '/m', kind: 'films', createdAt: '' })
    .run();
  const addMedia = (kind: MediaKind, durationSec: number | null): string => {
    const id = randomUUID();
    db.insert(media).values({ id, libraryId, kind, title: id, durationSec }).run();
    return id;
  };
  return { db, addMedia };
}

function setup() {
  const { db, addMedia } = progressDb();
  const profiles = new ProfileRepository(db);
  const owner = createAccount(db);
  const app = Fastify();
  actAs(app, () => ({ userId: owner.userId, role: 'owner', sessionId: owner.sessionId }));
  registerProgressRoutes(app, {
    progress: new ProgressRepository(db),
    profiles,
  });
  return { app, db, addMedia, profiles, userId: owner.userId };
}

describe('progress routes', () => {
  it('stores a position and returns it from GET /profiles/:profileId/progress', async () => {
    const { app, addMedia } = setup();
    const id = addMedia('film', 100);

    const put = await app.inject({
      method: 'PUT',
      url: `/profiles/default/media/${id}/progress`,
      payload: { positionSec: 30 },
    });
    const list = await app.inject({ method: 'GET', url: '/profiles/default/progress' });

    expect(put.statusCode).toBe(204);
    expect(list.json<WatchProgress[]>()).toMatchObject([
      { mediaId: id, positionSec: 30, durationSec: 100, finished: false },
    ]);
  });

  it('answers 404 media_not_found for an unknown media', async () => {
    const { app } = setup();

    const response = await app.inject({
      method: 'PUT',
      url: '/profiles/default/media/00000000-0000-4000-8000-000000000000/progress',
      payload: { positionSec: 1 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'media_not_found' });
  });

  it.each([
    { positionSec: -1 },
    { positionSec: 1.5 },
    {},
    { positionSec: '3' },
    { positionSec: 7 * 86_400 + 1 },
  ])('rejects the body %j', async (payload) => {
    const { app, addMedia } = setup();
    const id = addMedia('film', 100);

    const response = await app.inject({
      method: 'PUT',
      url: `/profiles/default/media/${id}/progress`,
      payload,
    });

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a series row, which has no file', async () => {
    const { app, addMedia } = setup();
    const series = addMedia('series', null);

    const response = await app.inject({
      method: 'PUT',
      url: `/profiles/default/media/${series}/progress`,
      payload: { positionSec: 1 },
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a media id that is not a uuid', async () => {
    const { app } = setup();

    const response = await app.inject({
      method: 'PUT',
      url: '/profiles/default/media/abc/progress',
      payload: { positionSec: 1 },
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    [
      'PUT',
      '/profiles/00000000-0000-4000-8000-000000000000/media/00000000-0000-4000-8000-000000000001/progress',
    ],
    ['GET', '/profiles/00000000-0000-4000-8000-000000000000/progress'],
  ] as const)('answers 404 profile_not_found on %s for an unknown profile', async (method, url) => {
    const { app } = setup();

    const response = await app.inject({ method, url, payload: { positionSec: 1 } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'profile_not_found' });
  });

  it.each(['PUT', 'GET'] as const)(
    'rejects a profile id that is neither default nor a uuid (%s)',
    async (method) => {
      const { app } = setup();
      const url =
        method === 'GET'
          ? '/profiles/bob/progress'
          : '/profiles/bob/media/00000000-0000-4000-8000-000000000001/progress';

      const response = await app.inject({ method, url, payload: { positionSec: 1 } });

      expect(response.statusCode).toBe(400);
    },
  );

  it('keeps two profiles apart end to end', async () => {
    const { app, addMedia, profiles, userId } = setup();
    const id = addMedia('film', 100);
    const kid = profiles.create(userId, { name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');
    const put = (profile: string, positionSec: number) =>
      app.inject({
        method: 'PUT',
        url: `/profiles/${profile}/media/${id}/progress`,
        payload: { positionSec },
      });

    await put('default', 10);
    await put(kid.profile.id, 60);
    const mine = await app.inject({ method: 'GET', url: '/profiles/default/progress' });
    const theirs = await app.inject({ method: 'GET', url: `/profiles/${kid.profile.id}/progress` });

    expect(mine.json<WatchProgress[]>()[0]?.positionSec).toBe(10);
    expect(theirs.json<WatchProgress[]>()[0]?.positionSec).toBe(60);
  });

  it("answers 404 profile_not_found for another user's profile", async () => {
    const { app, db, addMedia } = setup();
    const id = addMedia('film', 100);
    const guest = createAccount(db, 'guest', 'viewer');
    const guestProfile = new ProfileRepository(db).list(guest.userId)[0];
    if (!guestProfile) throw new Error('setup');

    const put = await app.inject({
      method: 'PUT',
      url: `/profiles/${guestProfile.id}/media/${id}/progress`,
      payload: { positionSec: 5 },
    });
    const get = await app.inject({ method: 'GET', url: `/profiles/${guestProfile.id}/progress` });

    expect(put.statusCode).toBe(404);
    expect(get.json()).toEqual({ error: 'profile_not_found' });
  });
});

describe('watched marks (spec watched-marks)', () => {
  it.each(['PUT', 'DELETE'] as const)(
    "should answer 404 profile_not_found to %s on another user's profile",
    async (method) => {
      const { app, db, addMedia } = setup();
      const id = addMedia('film', 100);
      const guest = createAccount(db, 'guest', 'viewer');
      const guestProfile = new ProfileRepository(db).list(guest.userId)[0];
      if (!guestProfile) throw new Error('setup');

      const response = await app.inject({
        method,
        url: `/profiles/${guestProfile.id}/media/${id}/watched`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'profile_not_found' });
    },
  );

  const list = async (app: ReturnType<typeof setup>['app']) =>
    (await app.inject({ method: 'GET', url: '/profiles/default/progress' })).json<
      WatchProgress[]
    >();

  it('should mark a film watched, keep it finished, then forget it when unmarked', async () => {
    const { app, addMedia } = setup();
    const id = addMedia('film', null);
    const url = `/profiles/default/media/${id}/watched`;

    const put = await app.inject({ method: 'PUT', url });
    const marked = await list(app);
    const del = await app.inject({ method: 'DELETE', url });

    expect(put.statusCode).toBe(204);
    expect(marked).toMatchObject([{ mediaId: id, positionSec: 0, finished: true }]);
    expect(del.statusCode).toBe(204);
    expect(await list(app)).toEqual([]);
  });

  it('should keep the saved position when marking watched', async () => {
    const { app, addMedia } = setup();
    const id = addMedia('film', 100);
    await app.inject({
      method: 'PUT',
      url: `/profiles/default/media/${id}/progress`,
      payload: { positionSec: 30 },
    });

    await app.inject({ method: 'PUT', url: `/profiles/default/media/${id}/watched` });

    expect(await list(app)).toMatchObject([{ mediaId: id, positionSec: 30, finished: true }]);
  });

  it('should apply a series mark to each of its episodes', async () => {
    const { app, db, addMedia } = setup();
    const series = addMedia('series', null);
    const episodes = [addMedia('episode', 100), addMedia('episode', 100)];
    for (const id of episodes)
      db.update(media).set({ seriesId: series }).where(eq(media.id, id)).run();

    await app.inject({ method: 'PUT', url: `/profiles/default/media/${series}/watched` });
    const marked = await list(app);
    await app.inject({ method: 'DELETE', url: `/profiles/default/media/${series}/watched` });

    expect(marked.map((row) => row.mediaId).sort()).toEqual([...episodes].sort());
    expect(marked.every((row) => row.finished)).toBe(true);
    expect(await list(app)).toEqual([]);
  });

  it('should answer 204 for a series with no episode yet', async () => {
    const { app, addMedia } = setup();
    const series = addMedia('series', null);

    const response = await app.inject({
      method: 'PUT',
      url: `/profiles/default/media/${series}/watched`,
    });

    expect(response.statusCode).toBe(204);
  });

  it.each([
    [
      'an unknown media',
      '/profiles/default/media/00000000-0000-4000-8000-000000000000/watched',
      404,
      'media_not_found',
    ],
    [
      'an unknown profile',
      '/profiles/00000000-0000-4000-8000-000000000001/media/00000000-0000-4000-8000-000000000000/watched',
      404,
      'profile_not_found',
    ],
    ['a bad id', '/profiles/default/media/nope/watched', 400, 'invalid_request'],
  ])('should refuse %s on PUT and DELETE', async (_, url, status, error) => {
    const { app } = setup();

    const response = await app.inject({ method: 'PUT', url });
    const removed = await app.inject({ method: 'DELETE', url });
    expect(removed.statusCode).toBe(status);

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error });
  });
});
