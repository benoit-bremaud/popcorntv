import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DEFAULT_PROFILE_ID } from '@popcorntv/shared';
import type { MediaKind } from '@popcorntv/shared';

import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { libraries, media, profiles } from '../db/schema.js';
import { ProgressRepository } from './repository.js';

const ME = DEFAULT_PROFILE_ID;

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

describe('ProgressRepository', () => {
  it('saves a position and lists it with its finished flag', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('film', 100);
    const repository = new ProgressRepository(db);

    expect(repository.save(ME, id, 42, new Date('2026-10-24T10:00:00Z'))).toBe(true);

    expect(repository.list(ME)).toEqual([
      {
        mediaId: id,
        positionSec: 42,
        durationSec: 100,
        finished: false,
        updatedAt: '2026-10-24T10:00:00.000Z',
      },
    ]);
  });

  it('overwrites the previous position of the same title', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('episode', 100);
    const repository = new ProgressRepository(db);

    repository.save(ME, id, 10);
    repository.save(ME, id, 95);

    const rows = repository.list(ME);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ positionSec: 95, finished: true });
  });

  it('clamps a position past the end to the duration', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('film', 100);
    const repository = new ProgressRepository(db);

    repository.save(ME, id, 500);

    expect(repository.list(ME)[0]?.positionSec).toBe(100);
  });

  it('keeps the position as is when the duration is unknown', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('unknown', null);
    const repository = new ProgressRepository(db);

    repository.save(ME, id, 500);

    expect(repository.list(ME)[0]).toMatchObject({ positionSec: 500, finished: false });
  });

  it('refuses an unknown media and a series row', () => {
    const { db, addMedia } = progressDb();
    const series = addMedia('series', null);
    const repository = new ProgressRepository(db);

    expect(repository.save(ME, '00000000-0000-4000-8000-000000000000', 1)).toBe(false);
    expect(repository.save(ME, series, 1)).toBe(false);
    expect(repository.list(ME)).toEqual([]);
  });

  it('lists the newest save first', () => {
    const { db, addMedia } = progressDb();
    const older = addMedia('film', 100);
    const newer = addMedia('film', 100);
    const repository = new ProgressRepository(db);

    repository.save(ME, older, 1, new Date('2026-10-24T10:00:00Z'));
    repository.save(ME, newer, 1, new Date('2026-10-24T11:00:00Z'));

    expect(repository.list(ME).map((row) => row.mediaId)).toEqual([newer, older]);
  });

  it('forgets the position when the media row goes away', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('film', 100);
    const repository = new ProgressRepository(db);
    repository.save(ME, id, 5);

    db.delete(media).where(eq(media.id, id)).run();

    expect(repository.list(ME)).toEqual([]);
  });

  it("keeps each profile's positions apart", () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('film', 100);
    const other = '11111111-1111-4111-8111-111111111111';
    db.insert(profiles)
      .values({ id: other, name: 'Kid', nameKey: 'kid', avatar: 'blue', createdAt: '' })
      .run();
    const repository = new ProgressRepository(db);

    repository.save(ME, id, 10);
    repository.save(other, id, 60);

    expect(repository.list(ME)[0]?.positionSec).toBe(10);
    expect(repository.list(other)[0]?.positionSec).toBe(60);
  });

  it('forgets the positions of a deleted profile', () => {
    const { db, addMedia } = progressDb();
    const id = addMedia('film', 100);
    const repository = new ProgressRepository(db);
    repository.save(ME, id, 5);

    db.delete(profiles).where(eq(profiles.id, ME)).run();

    expect(repository.list(ME)).toEqual([]);
  });
});
