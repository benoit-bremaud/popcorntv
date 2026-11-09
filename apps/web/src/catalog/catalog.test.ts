import { describe, expect, it } from 'vitest';
import type { WatchProgress } from '@popcorntv/shared';
import { ACTION, DOCUMENTARY, DRAMA, media, metadata } from '../test-fixtures.js';
import {
  availableGenres,
  byGenreRows,
  availableTypes,
  catalogItems,
  collapseCopies,
  continueWatchingRow,
  isWatched,
  watchedIds,
  genreRows,
  heroItem,
  homeRows,
  ofGenre,
  nextEpisode,
  searchItems,
  seasonsOf,
  shownIdOf,
  titleKey,
  topRated,
  typeOf,
} from './catalog.js';

const film = media({ id: 'f', title: 'Heat', metadata: metadata({ genres: [ACTION, DRAMA] }) });
const docFilm = media({ id: 'd', title: 'Planet', metadata: metadata({ genres: [DOCUMENTARY] }) });
const series = media({ id: 's', title: 'Dark', kind: 'series' });
const episode = media({
  id: 'e',
  title: 'Pilot',
  kind: 'episode',
  seriesId: 's',
  season: 1,
  episode: 1,
});
const unknown = media({ id: 'u', title: 'clip', kind: 'unknown' });

function rated(id: string, title: string, voteAverage: number, voteCount: number) {
  return media({ id, title, metadata: metadata({ voteAverage, voteCount }) });
}

describe('typeOf', () => {
  it('maps documentaries first, then the media kind', () => {
    expect(typeOf(docFilm)).toBe('documentaries');
    expect(typeOf(film)).toBe('films');
    expect(typeOf(series)).toBe('series');
    expect(typeOf(unknown)).toBe('others');
  });

  it('treats a documentary series as a documentary', () => {
    const docSeries = media({
      id: 'ds',
      title: 'Cosmos',
      kind: 'series',
      metadata: metadata({ genres: [DOCUMENTARY] }),
    });
    expect(typeOf(docSeries)).toBe('documentaries');
  });
});

describe('catalogItems / availableTypes', () => {
  it('drops episodes and lists only non-empty types in display order', () => {
    const items = catalogItems([unknown, episode, series, film]);
    expect(items.map((item) => item.id)).toEqual(['u', 's', 'f']);
    expect(availableTypes(items)).toEqual(['films', 'series', 'others']);
  });
});

describe('topRated', () => {
  it('keeps rated items with votes, best rating then votes then title, up to the limit', () => {
    const items = [
      rated('a', 'B', 7, 10),
      rated('b', 'A', 7, 10),
      rated('c', 'C', 8, 1),
      rated('d', 'D', 7, 50),
      rated('e', 'E', 9, 0),
      film,
    ];
    expect(topRated(items).map((item) => item.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(topRated(items, 2).map((item) => item.id)).toEqual(['c', 'd']);
  });
});

describe('genres', () => {
  const thriller = media({ id: 't', title: 'Alien', metadata: metadata({ genres: [ACTION] }) });

  it('lists genres by population, never the documentary genre', () => {
    expect(availableGenres([film, thriller, docFilm])).toEqual([ACTION, DRAMA]);
  });

  it('builds one A–Z row per genre', () => {
    const rows = genreRows([film, thriller]);
    expect(rows.map((row) => row.title)).toEqual(['Action', 'Drama']);
    expect(rows[0]?.items.map((item) => item.title)).toEqual(['Alien', 'Heat']);
    expect(ofGenre([film, unknown], DRAMA.id)).toEqual([film]);
  });

  it('breaks population ties by name', () => {
    expect(availableGenres([film])).toEqual([ACTION, DRAMA]);
  });
});

describe('byGenreRows', () => {
  it('adds the titles without genre after the genre rows, only when there are some', () => {
    expect(byGenreRows([film, unknown]).map((row) => row.key)).toEqual([
      'genre-28',
      'genre-18',
      'no-genre',
    ]);
    expect(byGenreRows([film]).map((row) => row.key)).toEqual(['genre-28', 'genre-18']);
  });

  it('keeps documentary-only titles reachable as other titles', () => {
    expect(byGenreRows([docFilm])).toEqual([
      { key: 'no-genre', title: 'Other titles', items: [docFilm] },
    ]);
  });
});

describe('homeRows', () => {
  it('orders top rated, types, then genres and drops empty rows', () => {
    const best = rated('r', 'Best', 9, 100);
    const rows = homeRows([film, best, series, docFilm]);
    expect(rows.map((row) => row.key)).toEqual([
      'top-rated',
      'type-films',
      'type-series',
      'type-documentaries',
      'genre-28',
      'genre-18',
    ]);
  });
});

describe('heroItem', () => {
  it('prefers the best-rated item with a backdrop, else the first with one, else null', () => {
    const plain = media({ id: 'p', title: 'P', metadata: metadata({ backdropPath: 'p.jpg' }) });
    const star = media({
      id: 's',
      title: 'S',
      metadata: metadata({ backdropPath: 's.jpg', voteAverage: 8, voteCount: 3 }),
    });
    expect(heroItem([plain, star])).toBe(star);
    expect(heroItem([film, plain])).toBe(plain);
    expect(heroItem([film])).toBeNull();
  });
});

describe('seasonsOf', () => {
  it('groups the series episodes by season in order', () => {
    const e2 = media({
      id: 'e2',
      title: 'Two',
      kind: 'episode',
      seriesId: 's',
      season: 1,
      episode: 2,
    });
    const s2 = media({
      id: 's2e1',
      title: 'Next',
      kind: 'episode',
      seriesId: 's',
      season: 2,
      episode: 1,
    });
    const other = media({
      id: 'x',
      title: 'X',
      kind: 'episode',
      seriesId: 'zz',
      season: 1,
      episode: 1,
    });
    const seasons = seasonsOf(series, [s2, e2, other, episode, film]);
    expect(seasons.map((season) => season.season)).toEqual([1, 2]);
    expect(seasons[0]?.episodes.map((item) => item.id)).toEqual(['e', 'e2']);
  });

  it('returns nothing for a film', () => {
    expect(seasonsOf(film, [episode])).toEqual([]);
  });
});

describe('nextEpisode', () => {
  const e1 = media({ id: 'e1', title: 'E1', kind: 'episode', season: 1, episode: 1 });
  const e2 = media({ id: 'e2', title: 'E2', kind: 'episode', season: 1, episode: 2 });
  const s2e1 = media({ id: 's2e1', title: 'S2E1', kind: 'episode', season: 2, episode: 1 });
  const seasons = [
    { season: 1, episodes: [e1, e2] },
    { season: 2, episodes: [s2e1] },
  ];

  it('returns the following episode of the same season', () => {
    expect(nextEpisode(seasons, e1)).toBe(e2);
  });

  it('crosses into the next season', () => {
    expect(nextEpisode(seasons, e2)).toBe(s2e1);
  });

  it('returns null after the last episode or for a title outside the list', () => {
    expect(nextEpisode(seasons, s2e1)).toBeNull();
    expect(nextEpisode(seasons, media({ id: 'film', title: 'Film' }))).toBeNull();
  });
});

describe('continueWatchingRow', () => {
  const ep2 = media({
    id: 'e2',
    title: 'Lies',
    kind: 'episode',
    seriesId: 's',
    season: 1,
    episode: 2,
  });
  const all = [film, series, episode, ep2, unknown];
  const saved = (mediaId: string, positionSec: number, finished = false): WatchProgress => ({
    mediaId,
    positionSec,
    durationSec: 100,
    finished,
    updatedAt: '2026-11-07T00:00:00.000Z',
  });

  it('should return null when nothing is in progress', () => {
    expect(continueWatchingRow(all, [])).toBeNull();
  });

  it('should list resumable titles in progress order with their fraction', () => {
    const row = continueWatchingRow(all, [saved('u', 20), saved('f', 50)]);

    expect(row?.items.map((item) => item.id)).toEqual(['u', 'f']);
    expect(row?.progress?.get('f')).toBe(0.5);
  });

  it.each([
    ['a finished film', saved('f', 95, true)],
    ['a barely started film', saved('f', 5)],
    ['a media no longer in the catalog', saved('gone', 50)],
  ])('should leave out %s', (_, row) => {
    expect(continueWatchingRow(all, [row])).toBeNull();
  });

  it('should show a series once, from its most recent episode', () => {
    const row = continueWatchingRow(all, [saved('e2', 30), saved('e', 40)]);

    expect(row?.items.map((item) => item.id)).toEqual(['s']);
    expect(row?.progress?.get('s')).toBe(0.3);
  });

  it('should offer the next episode after a finished one', () => {
    const row = continueWatchingRow(all, [saved('e', 95, true)]);

    expect(row?.items.map((item) => item.id)).toEqual(['s']);
    expect(row?.progress?.get('s')).toBe(0);
  });

  it('should show the next episode with its own resume progress', () => {
    const row = continueWatchingRow(all, [saved('e', 95, true), saved('e2', 30)]);

    expect(row?.progress?.get('s')).toBe(0.3);
  });

  it('should let an older episode decide when the latest is barely started', () => {
    const row = continueWatchingRow(all, [saved('e2', 5), saved('e', 95, true)]);

    expect(row?.items.map((item) => item.id)).toEqual(['s']);
    expect(row?.progress?.get('s')).toBe(0);
  });

  it('should leave out a series whose next episode is finished or missing', () => {
    expect(continueWatchingRow(all, [saved('e', 95, true), saved('e2', 95, true)])).toBeNull();
    expect(continueWatchingRow(all, [saved('e2', 95, true)])).toBeNull();
  });

  it('should keep a zero fraction when the duration is unknown', () => {
    const row = continueWatchingRow(all, [{ ...saved('f', 50), durationSec: null }]);

    expect(row?.progress?.get('f')).toBe(0);
  });

  it('should keep at most 20 titles', () => {
    const films = Array.from({ length: 25 }, (_, index) =>
      media({ id: `m${index}`, title: `M${index}` }),
    );
    const row = continueWatchingRow(
      films,
      films.map((item) => saved(item.id, 50)),
    );

    expect(row?.items).toHaveLength(20);
  });
});

describe('watched marks', () => {
  const ep2 = media({
    id: 'e2',
    title: 'Lies',
    kind: 'episode',
    seriesId: 's',
    season: 1,
    episode: 2,
  });
  const empty = media({ id: 'empty', title: 'Empty', kind: 'series' });
  const all = [film, series, episode, ep2, empty];
  const done = (mediaId: string, finished = true): WatchProgress => ({
    mediaId,
    positionSec: 0,
    durationSec: null,
    finished,
    updatedAt: '2026-11-07T00:00:00.000Z',
  });

  it('should count a series watched only when every episode is finished', () => {
    const half = new Map([['e', done('e')]]);
    const full = new Map([
      ['e', done('e')],
      ['e2', done('e2')],
    ]);

    expect(isWatched(series, all, half)).toBe(false);
    expect(isWatched(series, all, full)).toBe(true);
    expect(isWatched(empty, all, full)).toBe(false);
  });

  it('should list the watched top-level titles', () => {
    expect([...watchedIds(all, [done('f'), done('e'), done('e2')])].sort()).toEqual(['f', 's']);
    expect(watchedIds(all, [done('f', false)]).size).toBe(0);
  });
});

describe('searchItems', () => {
  const amelie = media({
    id: 'am',
    title: 'Amélie',
    metadata: metadata({
      cast: [{ name: 'Audrey Tautou', character: 'Amélie', profilePath: null }],
    }),
  });
  const heat = media({
    id: 'h',
    title: 'Heat',
    metadata: metadata({ cast: [{ name: 'Al Pacino', character: 'Hanna', profilePath: null }] }),
  });
  const audrey = media({ id: 'au', title: 'Audrey', metadata: null });

  it('should find titles without case or accents', () => {
    expect(searchItems([heat, amelie], '  AMELIE ').map((item) => item.id)).toEqual(['am']);
  });

  it('should find people, after the title matches', () => {
    expect(searchItems([heat, amelie, audrey], 'audrey').map((item) => item.id)).toEqual([
      'au',
      'am',
    ]);
    expect(searchItems([heat, amelie], 'pacino').map((item) => item.id)).toEqual(['h']);
  });

  it('should find nothing for an empty query or no match', () => {
    expect(searchItems([heat], '   ')).toEqual([]);
    expect(searchItems([heat], 'zzz')).toEqual([]);
  });
});

describe('titleKey', () => {
  it('should key a film by its TMDB id and part when known', () => {
    const item = media({ id: 'a', title: 'BBB', metadata: metadata({ tmdbId: 10378 }), part: 2 });

    expect(titleKey(item)).toBe('tmdb|10378|2');
  });

  it('should fall back to the tmdb tag of the file name', () => {
    expect(titleKey(media({ id: 'a', title: 'BBB', providerIds: { tmdb: '10378' } }))).toBe(
      'tmdb|10378|',
    );
  });

  it('should key an unmatched file by kind, folded title, year and part', () => {
    const item = media({ id: 'a', title: 'Ame\u0301lie', year: 2001, kind: 'unknown' });

    expect(titleKey(item)).toBe('unknown|am\u00e9lie|2001|');
  });

  it.each([series, episode])('should never key a series or an episode', (item) => {
    expect(titleKey(item)).toBeNull();
  });
});

describe('collapseCopies', () => {
  const films = media({ id: 'films', title: 'BBB', metadata: metadata({ tmdbId: 7 }) });
  const animation = media({
    id: 'animation',
    title: 'BBB',
    libraryId: 'lib-2',
    metadata: metadata({ tmdbId: 7 }),
  });

  function saved(mediaId: string): WatchProgress {
    return {
      mediaId,
      positionSec: 60,
      durationSec: 600,
      finished: false,
      updatedAt: '2026-11-09T10:00:00.000Z',
    };
  }

  it('should show the first copy in library order when none was played', () => {
    const { media: shown, copies } = collapseCopies([films, animation, heatFilm()], []);

    expect(shown.map((item) => item.id)).toEqual(['films', 'heat']);
    expect(copies.get('films')).toEqual([films, animation]);
  });

  it('should show the copy the profile saved most recently', () => {
    const { media: shown, copies } = collapseCopies(
      [films, animation],
      [saved('animation'), saved('films')],
    );

    expect(shown).toEqual([animation]);
    expect(copies.get('animation')).toEqual([films, animation]);
  });

  it('should keep a different part, a different year and every series apart', () => {
    const part2 = { ...animation, id: 'part-2', part: 2 };
    const remake = media({ id: 'remake', title: 'Heat', year: 2030 });
    const darkCopy = { ...series, id: 's2', libraryId: 'lib-2' };

    const { media: shown, copies } = collapseCopies(
      [films, part2, heatFilm(), remake, series, darkCopy, episode],
      [],
    );

    expect(shown).toHaveLength(7);
    expect(copies.size).toBe(0);
  });

  it('should leave an empty catalog empty', () => {
    expect(collapseCopies([], [])).toEqual({ media: [], copies: new Map() });
  });

  it('should map a hidden copy to its shown id, any other id to itself', () => {
    const { copies } = collapseCopies([films, animation], []);

    expect(shownIdOf('animation', copies)).toBe('films');
    expect(shownIdOf('films', copies)).toBe('films');
    expect(shownIdOf('other', copies)).toBe('other');
  });

  it('should mark the shown card watched when a hidden copy is', () => {
    const { copies } = collapseCopies([films, animation], []);
    const done = { ...saved('animation'), finished: true };

    expect(watchedIds([films, animation], [done], copies)).toEqual(new Set(['films']));
  });

  function heatFilm() {
    return media({ id: 'heat', title: 'Heat', year: 1995, metadata: null });
  }
});
