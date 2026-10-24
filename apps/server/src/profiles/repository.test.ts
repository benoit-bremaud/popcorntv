import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE_ID, PROFILE_LIMIT } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { ProfileRepository } from './repository.js';

function repository(): ProfileRepository {
  return new ProfileRepository(openDatabase(':memory:'));
}

describe('ProfileRepository', () => {
  it('starts with the seeded default profile', () => {
    expect(repository().list()).toEqual([{ id: DEFAULT_PROFILE_ID, name: 'Me', avatar: 'red' }]);
  });

  it('creates profiles and lists them oldest first', () => {
    const profiles = repository();

    const created = profiles.create({ name: 'Kid', avatar: 'blue' }, new Date('2099-01-01'));

    expect(created).toMatchObject({ ok: true, profile: { name: 'Kid', avatar: 'blue' } });
    expect(profiles.list().map((p) => p.name)).toEqual(['Me', 'Kid']);
  });

  it('refuses a name already used, whatever its case', () => {
    const profiles = repository();

    expect(profiles.create({ name: 'ME', avatar: 'blue' })).toEqual({
      ok: false,
      reason: 'profile_name_taken',
    });
  });

  it('refuses a profile past the limit', () => {
    const profiles = repository();
    for (let i = 1; i < PROFILE_LIMIT; i += 1) profiles.create({ name: `P${i}`, avatar: 'teal' });

    expect(profiles.create({ name: 'One too many', avatar: 'teal' })).toEqual({
      ok: false,
      reason: 'profile_limit',
    });
  });

  it('renames and recolours a profile, keeping its own name allowed', () => {
    const profiles = repository();

    expect(profiles.update(DEFAULT_PROFILE_ID, { name: 'me', avatar: 'green' })).toEqual({
      ok: true,
      profile: { id: DEFAULT_PROFILE_ID, name: 'me', avatar: 'green' },
    });
    expect(profiles.list()[0]).toMatchObject({ name: 'me', avatar: 'green' });
  });

  it("refuses to rename onto another profile's name, and an unknown id", () => {
    const profiles = repository();
    const kid = profiles.create({ name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');

    expect(profiles.update(kid.profile.id, { name: 'me' })).toEqual({
      ok: false,
      reason: 'profile_name_taken',
    });
    expect(profiles.update('00000000-0000-4000-8000-000000000000', {})).toEqual({
      ok: false,
      reason: 'profile_not_found',
    });
  });

  it('deletes a profile but never the last one', () => {
    const profiles = repository();
    const kid = profiles.create({ name: 'Kid', avatar: 'blue' });
    if (!kid.ok) throw new Error('setup');

    expect(profiles.remove(DEFAULT_PROFILE_ID)).toBe('removed');
    expect(profiles.exists(DEFAULT_PROFILE_ID)).toBe(false);
    expect(profiles.remove(kid.profile.id)).toBe('last_profile');
    expect(profiles.remove(DEFAULT_PROFILE_ID)).toBe('profile_not_found');
  });
});
