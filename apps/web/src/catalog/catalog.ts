import { DOCUMENTARY_GENRE_ID, isDocumentary } from '@popcorntv/shared';
import type { Genre, Library, LibraryKind, Media, WatchProgress } from '@popcorntv/shared';
import { resumeAt } from '../playback/resume.js';

/** The catalog's type tabs (spec §2), in display order. */
export const CATALOG_TYPES = ['films', 'series', 'documentaries', 'others'] as const;

/** What a catalog item is, for browsing purposes. */
export type CatalogType = (typeof CATALOG_TYPES)[number];

/** Display label of each type. */
export const TYPE_LABELS: Readonly<Record<CatalogType, string>> = {
  films: 'Films',
  series: 'Series',
  documentaries: 'Documentaries',
  others: 'Others',
};

/** A titled shelf of items; `key` is stable across renders. */
export interface Row {
  readonly key: string;
  readonly title: string;
  readonly items: readonly Media[];
  /** Watched fraction (0–1) per item id, for the progress bar of the cards. */
  readonly progress?: ReadonlyMap<string, number>;
}

const TOP_RATED_LIMIT = 20;
const CONTINUE_WATCHING_LIMIT = 20;

/**
 * Which title a file holds, for collapsing copies (spec duplicate-titles R1): its TMDB id in
 * its library's TMDB namespace (a films library looks up movies, a series library TV shows)
 * and part when known, else its kind, folded title, year and part; null for a series or an
 * episode, never collapsed (R2). Pure.
 */
export function titleKey(item: Media, libraryKind: LibraryKind | undefined): string | null {
  if (item.kind === 'series' || item.kind === 'episode') return null;
  const tmdb = item.metadata?.tmdbId ?? item.providerIds.tmdb ?? null;
  if (tmdb !== null) {
    const namespace = libraryKind ?? item.libraryId;
    return JSON.stringify(['tmdb', namespace, String(tmdb), item.part]);
  }
  return JSON.stringify([
    item.kind,
    item.title.normalize('NFC').toLowerCase(),
    item.year,
    item.part,
  ]);
}

/** The catalog with one card per title, and what each collapsed title is made of. */
export interface Collapsed {
  /** The media without the hidden copies; episodes and series untouched. */
  readonly media: readonly Media[];
  /** Every copy of a title held by two files or more, in library order, by shown id. */
  readonly copies: ReadonlyMap<string, readonly Media[]>;
  /** The copy a collapsed title stands for: the most recently saved, else the first (R3). */
  readonly current: ReadonlyMap<string, Media>;
  /** The progress of the titles: only the current copy's rows, under the shown id (R3). */
  readonly progress: readonly WatchProgress[];
}

/**
 * Spec duplicate-titles R1–R3: the files holding the same title show as one card, the first
 * copy in library order (a stable card); the copy the profile saved most recently decides the
 * card's progress, watched mark and Continue watching entry. Pure.
 */
export function collapseCopies(
  media: readonly Media[],
  progress: readonly WatchProgress[],
  libraries: readonly Library[],
): Collapsed {
  const kinds = new Map(libraries.map((library) => [library.id, library.kind]));
  const groups = new Map<string, Media[]>();
  for (const item of media) {
    const key = titleKey(item, kinds.get(item.libraryId));
    if (key !== null) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  // `GET /progress` answers the most recently saved row first.
  const recency = new Map(progress.map((row, index) => [row.mediaId, index]));
  const rank = (item: Media): number => recency.get(item.id) ?? Number.POSITIVE_INFINITY;
  const shownOf = new Map<string, string>();
  const copies = new Map<string, readonly Media[]>();
  const current = new Map<string, Media>();
  for (const [shown, ...rest] of groups.values()) {
    if (shown === undefined || rest.length === 0) continue;
    const group = [shown, ...rest];
    copies.set(shown.id, group);
    current.set(
      shown.id,
      group.reduce((best, item) => (rank(item) < rank(best) ? item : best), shown),
    );
    for (const item of group) shownOf.set(item.id, shown.id);
  }
  const titles = progress.flatMap((row) => {
    const shown = shownOf.get(row.mediaId);
    if (shown === undefined) return [row];
    return current.get(shown)?.id === row.mediaId ? [{ ...row, mediaId: shown }] : [];
  });
  return {
    media: media.filter((item) => (shownOf.get(item.id) ?? item.id) === item.id),
    copies,
    current,
    progress: titles,
  };
}

/** Top-level items only: episodes live inside their series (spec §2). */
export function catalogItems(media: readonly Media[]): Media[] {
  return media.filter((item) => item.kind !== 'episode');
}

/** Documentaries first (any kind), then the media kind decides. */
export function typeOf(item: Media): CatalogType {
  if (item.metadata !== null && isDocumentary(item.metadata)) return 'documentaries';
  if (item.kind === 'film') return 'films';
  if (item.kind === 'series') return 'series';
  return 'others';
}

/** Items of one type. */
export function ofType(items: readonly Media[], type: CatalogType): Media[] {
  return items.filter((item) => typeOf(item) === type);
}

/** Types that have at least one item, in display order (spec 4a). */
export function availableTypes(items: readonly Media[]): CatalogType[] {
  return CATALOG_TYPES.filter((type) => items.some((item) => typeOf(item) === type));
}

/** A copy sorted by title, locale-aware. */
export function sortByTitle(items: readonly Media[]): Media[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}

function isRated(item: Media): boolean {
  return (item.metadata?.voteAverage ?? null) !== null && (item.metadata?.voteCount ?? 0) > 0;
}

/** Rated items, best first (rating, then votes, then title), at most `limit`. */
export function topRated(items: readonly Media[], limit = TOP_RATED_LIMIT): Media[] {
  return items
    .filter(isRated)
    .sort(
      (a, b) =>
        (b.metadata?.voteAverage ?? 0) - (a.metadata?.voteAverage ?? 0) ||
        (b.metadata?.voteCount ?? 0) - (a.metadata?.voteCount ?? 0) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}

/** Genres present among the items (documentary excluded), most populated first. */
export function availableGenres(items: readonly Media[]): Genre[] {
  const counts = new Map<number, { genre: Genre; count: number }>();
  for (const item of items) {
    for (const genre of item.metadata?.genres ?? []) {
      if (genre.id === DOCUMENTARY_GENRE_ID) continue;
      const entry = counts.get(genre.id) ?? { genre, count: 0 };
      counts.set(genre.id, { genre: entry.genre, count: entry.count + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.genre.name.localeCompare(b.genre.name))
    .map((entry) => entry.genre);
}

/** Items carrying a genre, A–Z. */
export function ofGenre(items: readonly Media[], genreId: number): Media[] {
  return sortByTitle(
    items.filter((item) => item.metadata?.genres.some((genre) => genre.id === genreId) ?? false),
  );
}

/** One row per available genre. */
export function genreRows(items: readonly Media[]): Row[] {
  return availableGenres(items).map((genre) => ({
    key: `genre-${genre.id}`,
    title: genre.name,
    items: ofGenre(items, genre.id),
  }));
}

/** "By genre" view of a type: genre rows, then the titles with no displayable genre. */
export function byGenreRows(items: readonly Media[]): Row[] {
  // Genre 99 never gets a row (it is a type): a documentary-only title counts as untagged.
  const untagged = items.filter(
    (item) => !(item.metadata?.genres ?? []).some((genre) => genre.id !== DOCUMENTARY_GENRE_ID),
  );
  const rows = genreRows(items);
  return untagged.length === 0
    ? rows
    : [...rows, { key: 'no-genre', title: 'Other titles', items: sortByTitle(untagged) }];
}

/** Home view rows (spec UC3 step 3): top rated, one per type, then genres; empty rows dropped. */
export function homeRows(items: readonly Media[]): Row[] {
  const rows: Row[] = [
    { key: 'top-rated', title: 'Top rated', items: topRated(items) },
    ...CATALOG_TYPES.map((type) => ({
      key: `type-${type}`,
      title: TYPE_LABELS[type],
      items: sortByTitle(ofType(items, type)),
    })),
    ...genreRows(items),
  ];
  return rows.filter((row) => row.items.length > 0);
}

/** The hero banner's item: the best-rated item with a backdrop, else the first with one. */
export function heroItem(items: readonly Media[]): Media | null {
  const withBackdrop = items.filter((item) => item.metadata?.backdropPath);
  return topRated(withBackdrop, 1)[0] ?? withBackdrop[0] ?? null;
}

/** A season and its episodes, in order. */
export interface Season {
  readonly season: number | null;
  readonly episodes: readonly Media[];
}

/** Episodes of a series grouped by season, seasons and episodes ascending. */
export function seasonsOf(series: Media, media: readonly Media[]): Season[] {
  const episodes = media
    .filter((item) => item.kind === 'episode' && item.seriesId === series.id)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0));
  const seasons = new Map<number | null, Media[]>();
  for (const episode of episodes) {
    seasons.set(episode.season, [...(seasons.get(episode.season) ?? []), episode]);
  }
  return [...seasons.entries()].map(([season, list]) => ({ season, episodes: list }));
}

/** The episode after `current` in season order (UC7), or null for the last one or a film. */
export function nextEpisode(seasons: readonly Season[], current: Media): Media | null {
  const episodes = seasons.flatMap((season) => season.episodes);
  const index = episodes.findIndex((episode) => episode.id === current.id);
  return index === -1 ? null : (episodes[index + 1] ?? null);
}

/** Watched fraction of a progress row, 0 when the duration is unknown. */
function fractionOf(row: WatchProgress): number {
  return row.durationSec === null || row.durationSec <= 0
    ? 0
    : Math.min(row.positionSec / row.durationSec, 1);
}

/** Watched fraction to resume from, 0 when there is no resume point. */
function resumeFraction(row: WatchProgress | undefined): number {
  return row !== undefined && resumeAt(row) > 0 ? fractionOf(row) : 0;
}

/** What a series' most recent finished episode offers: the next one's fraction, or null. */
function nextEpisodeFraction(
  series: Media,
  finished: Media,
  media: readonly Media[],
  saved: ReadonlyMap<string, WatchProgress>,
): number | null {
  const next = nextEpisode(seasonsOf(series, media), finished);
  if (next === null) return null;
  const nextRow = saved.get(next.id);
  return nextRow?.finished === true ? null : resumeFraction(nextRow);
}

/**
 * What one progress row decides for its title (R3, R4): a fraction to show it with, null to
 * leave it out, or undefined when a barely started episode lets an older row decide.
 */
function decide(
  row: WatchProgress,
  played: Media,
  title: Media,
  media: readonly Media[],
  saved: ReadonlyMap<string, WatchProgress>,
): number | null | undefined {
  if (resumeAt(row) > 0) return fractionOf(row);
  if (played.kind !== 'episode') return null;
  if (!row.finished) return undefined;
  return nextEpisodeFraction(title, played, media, saved);
}

/**
 * UC22 (spec continue-watching R3–R5): titles to pick up again, most recently saved first.
 * A series appears once, decided by its most recently saved episode.
 */
export function continueWatchingRow(
  media: readonly Media[],
  progress: readonly WatchProgress[],
): Row | null {
  const byId = new Map(media.map((item) => [item.id, item]));
  const saved = new Map(progress.map((row) => [row.mediaId, row]));
  const decided = new Set<string>();
  const fractions = new Map<string, number>();
  const items: Media[] = [];
  for (const row of progress) {
    const played = byId.get(row.mediaId);
    const title = played?.kind === 'episode' ? byId.get(played.seriesId ?? '') : played;
    if (played === undefined || title === undefined || decided.has(title.id)) continue;
    const fraction = decide(row, played, title, media, saved);
    if (fraction === undefined) continue;
    decided.add(title.id);
    if (fraction === null) continue;
    fractions.set(title.id, fraction);
    items.push(title);
    if (items.length === CONTINUE_WATCHING_LIMIT) break;
  }
  return items.length === 0
    ? null
    : { key: 'continue-watching', title: 'Continue watching', items, progress: fractions };
}

/**
 * Whether a profile has watched a title (spec watched-marks R4): a film when its progress is
 * finished, a series when it has episodes and every one is finished.
 */
export function isWatched(
  item: Media,
  media: readonly Media[],
  saved: ReadonlyMap<string, WatchProgress>,
): boolean {
  if (item.kind !== 'series') return saved.get(item.id)?.finished === true;
  const episodes = seasonsOf(item, media).flatMap((season) => season.episodes);
  return episodes.length > 0 && episodes.every((episode) => saved.get(episode.id)?.finished);
}

/** Ids of the top-level titles a profile has watched, for the poster marks (R4). */
export function watchedIds(
  media: readonly Media[],
  progress: readonly WatchProgress[],
): ReadonlySet<string> {
  const saved = new Map(progress.map((row) => [row.mediaId, row]));
  return new Set(
    catalogItems(media)
      .filter((item) => isWatched(item, media, saved))
      .map((item) => item.id),
  );
}

/** Lower case without accents, so "amelie" finds "Amélie" (spec search R2). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * UC24 (spec search R2, R3): top-level items whose title or a cast member's name contains
 * the query; title matches first, each group A–Z. An empty query finds nothing.
 */
export function searchItems(items: readonly Media[], query: string): Media[] {
  const needle = fold(query.trim());
  if (needle === '') return [];
  const byTitle = items.filter((item) => fold(item.title).includes(needle));
  const titled = new Set(byTitle);
  const byPerson = items.filter(
    (item) =>
      !titled.has(item) &&
      (item.metadata?.cast.some((member) => fold(member.name).includes(needle)) ?? false),
  );
  return [...sortByTitle(byTitle), ...sortByTitle(byPerson)];
}
