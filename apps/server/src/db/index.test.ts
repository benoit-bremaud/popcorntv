import { readFileSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDatabase } from './index.js';
import { libraries, media, streams } from './schema.js';

const REPROBE_COVER_ART = readFileSync(
  new URL('../../drizzle/0003_reprobe-cover-art.sql', import.meta.url),
  'utf8',
);

describe('migration 0003 reprobe-cover-art', () => {
  it('clears the fingerprint of files whose stored probe holds cover art only', () => {
    const db = openDatabase(':memory:');
    db.insert(libraries)
      .values({ id: 'l', name: 'Films', rootPath: '/m', kind: 'films', createdAt: 'now' })
      .run();
    for (const [id, codec] of [
      ['cover', 'mjpeg'],
      ['film', 'hevc'],
    ] as const) {
      db.insert(media)
        .values({ id, libraryId: 'l', kind: 'film', title: id, fileMtimeMs: 1 })
        .run();
      db.insert(streams).values({ mediaId: id, position: 0, type: 'video', codec }).run();
    }

    db.run(sql.raw(REPROBE_COVER_ART));

    const rows = db.select({ id: media.id, mtime: media.fileMtimeMs }).from(media).all();
    expect(rows).toEqual([
      { id: 'cover', mtime: null },
      { id: 'film', mtime: 1 },
    ]);
  });
});

/** Applies the migration files after `after` up to and including `last`, like the migrator. */
function migrate(client: Database.Database, after: string, last: string): void {
  const folder = new URL('../../drizzle/', import.meta.url);
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (file <= after) continue;
    if (file > last) break;
    for (const statement of readFileSync(new URL(file, folder), 'utf8').split(
      '--> statement-breakpoint',
    )) {
      client.exec(statement);
    }
  }
}

describe('migration 0006 accounts', () => {
  it('keeps every profile and its progress, owner-less until setup', () => {
    const client = new Database(':memory:');
    client.pragma('foreign_keys = ON');
    migrate(client, '', '0005_profiles.sql');
    client.exec(`
      INSERT INTO libraries VALUES ('l', 'Films', '/m', 'films', 'now');
      INSERT INTO media (id, library_id, kind, title) VALUES ('m', 'l', 'film', 'Heat');
      INSERT INTO watch_progress VALUES ('default', 'm', 42, 'now');
    `);

    client.transaction(() => migrate(client, '0005_profiles.sql', '0006_accounts.sql'))();

    expect(client.prepare('SELECT id, user_id FROM profiles').all()).toEqual([
      { id: 'default', user_id: null },
    ]);
    expect(client.prepare('SELECT profile_id, position_sec FROM watch_progress').all()).toEqual([
      { profile_id: 'default', position_sec: 42 },
    ]);
    expect(client.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('migration 0009 wishlist-notifications', () => {
  it('starts existing wishlist rows from what is on disk, providers not looked at yet', () => {
    const client = new Database(':memory:');
    client.pragma('foreign_keys = ON');
    migrate(client, '', '0008_wishlist.sql');
    client.exec(`
      INSERT INTO libraries VALUES ('l', 'Films', '/m', 'films', 'now');
      INSERT INTO media (id, library_id, kind, title, tmdb_id) VALUES ('m', 'l', 'film', 'Dune', 1);
      INSERT INTO media (id, library_id, kind, title, tmdb_id) VALUES ('s', 'l', 'series', 'Dark', 2);
      INSERT INTO wishlist VALUES ('default', 'movie', 1, 'Dune', 2021, '', 7, NULL, 'now');
      INSERT INTO wishlist VALUES ('default', 'movie', 2, 'Other', 2021, '', 7, NULL, 'now');
      INSERT INTO wishlist VALUES ('default', 'tv', 2, 'Dark', 2017, '', 8, NULL, 'now');
    `);

    migrate(client, '0008_wishlist.sql', '0009_wishlist-notifications.sql');

    expect(
      client
        .prepare(
          'SELECT kind, tmdb_id, seen_in_library, seen_provider_ids FROM wishlist ORDER BY kind, tmdb_id',
        )
        .all(),
    ).toEqual([
      { kind: 'movie', tmdb_id: 1, seen_in_library: 1, seen_provider_ids: null },
      { kind: 'movie', tmdb_id: 2, seen_in_library: 0, seen_provider_ids: null },
      { kind: 'tv', tmdb_id: 2, seen_in_library: 1, seen_provider_ids: null },
    ]);
  });
});
