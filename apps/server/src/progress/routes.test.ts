import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { MediaKind, WatchProgress } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { libraries, media } from '../db/schema.js';
import { ProfileRepository } from '../profiles/repository.js';
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
  const app = Fastify();
  registerProgressRoutes(app, {
    progress: new ProgressRepository(db),
    profiles: new ProfileRepository(db),
  });
  return { app, addMedia };
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
});
