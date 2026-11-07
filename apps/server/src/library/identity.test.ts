import { describe, expect, it } from 'vitest';
import type { MediaIdentity } from './identity.js';
import { carryOverTargets, identityKeys } from './identity.js';

const film = (id: string, overrides: Partial<MediaIdentity> = {}) => ({
  id,
  kind: 'film' as const,
  parsedTitle: 'Heat',
  year: 1995,
  season: null,
  episode: null,
  part: null,
  seriesId: null,
  tmdbId: null,
  providerIds: {},
  ...overrides,
});

describe('identityKeys', () => {
  it('should key a film by parsed title and year, plus TMDB when known', () => {
    expect(identityKeys(film('a', { tmdbId: 949 }))).toEqual(['film|heat|1995|', 'tmdb|949|']);
    expect(identityKeys(film('a', { providerIds: { tmdb: '949' } }))).toContain('tmdb|949|');
  });

  it('should key an episode by its series and numbers only', () => {
    const episode = film('e', { kind: 'episode', seriesId: 's', season: 1, episode: 2 });

    expect(identityKeys(episode)).toEqual(['episode|s|1|2']);
    expect(identityKeys({ ...episode, episode: null })).toEqual([]);
    expect(identityKeys({ ...episode, kind: 'series' })).toEqual([]);
  });
});

describe('carryOverTargets', () => {
  it('should map a removed file to the one present file with the same title', () => {
    const targets = carryOverTargets([film('old')], [film('new'), film('other', { year: 2000 })]);

    expect(targets).toEqual(new Map([['old', 'new']]));
  });

  it('should match on TMDB even when the parsed title changed', () => {
    const targets = carryOverTargets(
      [film('old', { tmdbId: 949 })],
      [film('new', { parsedTitle: 'Heat Remastered', providerIds: { tmdb: '949' } })],
    );

    expect(targets.get('old')).toBe('new');
  });

  it('should carry nothing when the match is ambiguous or missing', () => {
    expect(carryOverTargets([film('old')], [film('a'), film('b')]).size).toBe(0);
    expect(carryOverTargets([film('old')], []).size).toBe(0);
  });
});
