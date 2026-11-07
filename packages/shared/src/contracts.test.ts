import { describe, expect, it } from 'vitest';
import { DISCOVER_KINDS, DISCOVER_LISTS } from './discover.js';
import { AVATAR_COLORS, DEFAULT_PROFILE_ID, PROFILE_LIMIT, PROFILE_NAME_MAX } from './profiles.js';

/** The enum lists feed both the zod schemas and the SQLite enums: a change is a migration. */
describe('shared enums and limits', () => {
  it('keeps the Discover kinds and lists the server routes accept', () => {
    expect(DISCOVER_KINDS).toEqual(['movie', 'tv']);
    expect(DISCOVER_LISTS).toEqual(['trending', 'popular']);
  });

  it('keeps the profile constants of spec profiles §4', () => {
    expect(AVATAR_COLORS).toHaveLength(8);
    expect(DEFAULT_PROFILE_ID).toBe('default');
    expect([PROFILE_NAME_MAX, PROFILE_LIMIT]).toEqual([40, 12]);
  });
});
