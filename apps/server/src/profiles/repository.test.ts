import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE_ID, PROFILE_LIMIT } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { libraries, media } from '../db/schema.js';
import { ProgressRepository } from '../progress/repository.js';
import { UserRepository } from '../auth/user-repository.js';
import type { AppDatabase } from '../db/index.js';
import { ProfileRepository } from './repository.js';

/** The first owner, who adopted the seeded `default` profile (UC11). */
const OWNER = 'owner';

function addUser(db: AppDatabase, username: string): string {
  return new UserRepository(db).create(username, 'hash', 'viewer', new Date()).id;
}

function repository(db: AppDatabase = openDatabase(':memory:')): ProfileRepository {
  const profiles = new ProfileRepository(db);
  db.run(sql`insert into users (id, username, username_key, password_hash, role, created_at)
    values (${OWNER}, 'owner', 'owner', 'hash', 'owner', '')`);
  profiles.adoptOrphans(OWNER);
  return profiles;
}

describe('ProfileRepository', () => {
  it('starts with the seeded default profile', () => {
    expect(repository().list(OWNER)).toEqual([
      { id: DEFAULT_PROFILE_ID, name: 'Me', avatar: 'red' },
    ]);
  });

  it('creates profiles and lists them oldest first', () => {
    const profiles = repository();

    profiles.create(OWNER, { name: 'Later', avatar: 'teal' }, new Date('2099-02-01'));
    const created = profiles.create(OWNER, { name: 'Kid', avatar: 'blue' }, new Date('2099-01-01'));

    expect(created).toMatchObject({ ok: true, profile: { name: 'Kid', avatar: 'blue' } });
    expect(profiles.list(OWNER).map((p) => p.name)).toEqual(['Me', 'Kid', 'Later']);
  });

  it('refuses a name already used, whatever its case', () => {
    const profiles = repository();

    expect(profiles.create(OWNER, { name: 'ME', avatar: 'blue' })).toEqual({
      ok: false,
      reason: 'profile_name_taken',
    });
  });

  it('refuses a profile past the limit', () => {
    const profiles = repository();
    for (let i = 1; i < PROFILE_LIMIT; i += 1)
      profiles.create(OWNER, { name: `P${i}`, avatar: 'teal' });

    expect(profiles.create(OWNER, { name: 'One too many', avatar: 'teal' })).toEqual({
      ok: false,
      reason: 'profile_limit',
    });
  });

  it('renames and recolours a profile, keeping its own name allowed', () => {
    const profiles = repository();

    expect(profiles.update(OWNER, DEFAULT_PROFILE_ID, { name: 'me', avatar: 'green' })).toEqual({
      ok: true,
      profile: { id: DEFAULT_PROFILE_ID, name: 'me', avatar: 'green' },
    });
    expect(profiles.list(OWNER)[0]).toMatchObject({ name: 'me', avatar: 'green' });
  });

  it("refuses to rename onto another profile's name, and an unknown id", () => {
    const profiles = repository();
    const kid = profiles.create(OWNER, { name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');

    expect(profiles.update(OWNER, kid.profile.id, { name: 'me' })).toEqual({
      ok: false,
      reason: 'profile_name_taken',
    });
    expect(profiles.update(OWNER, '00000000-0000-4000-8000-000000000000', {})).toEqual({
      ok: false,
      reason: 'profile_not_found',
    });
  });

  it('deletes a profile but never the last one', () => {
    const profiles = repository();
    const kid = profiles.create(OWNER, { name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');

    expect(profiles.remove(OWNER, DEFAULT_PROFILE_ID)).toBe('removed');
    expect(profiles.exists(OWNER, DEFAULT_PROFILE_ID)).toBe(false);
    expect(profiles.remove(OWNER, kid.profile.id)).toBe('last_profile');
    expect(profiles.remove(OWNER, DEFAULT_PROFILE_ID)).toBe('profile_not_found');
  });

  it('deletes the progress of a removed profile', () => {
    const db = openDatabase(':memory:');
    const libraryId = randomUUID();
    const mediaId = randomUUID();
    db.insert(libraries)
      .values({ id: libraryId, name: 'Films', rootPath: '/m', kind: 'films', createdAt: '' })
      .run();
    db.insert(media).values({ id: mediaId, libraryId, kind: 'film', title: 'Heat' }).run();
    const profiles = repository(db);
    const progress = new ProgressRepository(db);
    const kid = profiles.create(OWNER, { name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');
    progress.save(kid.profile.id, mediaId, 30);

    profiles.remove(OWNER, kid.profile.id);

    expect(progress.list(kid.profile.id)).toEqual([]);
  });

  it('maps a unique-index hit that slipped past the check to profile_name_taken', () => {
    const profiles = repository();
    // Simulates a second process inserting the same name between the check and the write.
    vi.spyOn(profiles as unknown as { nameTaken: () => boolean }, 'nameTaken').mockReturnValue(
      false,
    );

    expect(profiles.create(OWNER, { name: 'me', avatar: 'blue' })).toEqual({
      ok: false,
      reason: 'profile_name_taken',
    });
    expect(profiles.update(OWNER, DEFAULT_PROFILE_ID, { name: 'Me' })).toMatchObject({ ok: true });
  });

  it('keeps every rule per user: names, lists and ids of others read as unknown', () => {
    const db = openDatabase(':memory:');
    const profiles = repository(db);
    const other = addUser(db, 'guest');

    const guestMe = profiles.create(other, { name: 'Me', avatar: 'blue' });

    expect(guestMe).toMatchObject({ ok: true });
    expect(profiles.list(other).map((p) => p.name)).toEqual(['Me']);
    expect(profiles.list(OWNER).map((p) => p.name)).toEqual(['Me']);
    expect(profiles.exists(other, DEFAULT_PROFILE_ID)).toBe(false);
    expect(profiles.update(other, DEFAULT_PROFILE_ID, { name: 'Mine' })).toEqual({
      ok: false,
      reason: 'profile_not_found',
    });
    expect(profiles.remove(other, DEFAULT_PROFILE_ID)).toBe('profile_not_found');
  });

  it('gives a new account a first profile named after it, once', () => {
    const db = openDatabase(':memory:');
    const profiles = repository(db);
    const guest = addUser(db, 'guest');

    profiles.createFirst(guest, 'guest');
    profiles.createFirst(guest, 'guest');
    profiles.createFirst(OWNER, 'owner');

    expect(profiles.list(guest)).toMatchObject([{ name: 'guest', avatar: 'red' }]);
    expect(profiles.list(OWNER).map((p) => p.name)).toEqual(['Me']);
  });

  it('deletes the profiles of a deleted account', () => {
    const db = openDatabase(':memory:');
    const profiles = repository(db);
    const guest = addUser(db, 'guest');
    profiles.createFirst(guest, 'guest');

    db.run(sql`delete from users where id = ${guest}`);

    expect(profiles.list(guest)).toEqual([]);
  });
});
