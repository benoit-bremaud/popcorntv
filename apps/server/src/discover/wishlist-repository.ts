import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { DiscoverKind, DiscoverTitle, WishlistEntry } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { media, wishlist } from '../db/schema.js';

/** A Discover title before its local match is known. */
export type TitleFacts = Omit<DiscoverTitle, 'mediaId'>;

/** The key of a wishlist row. */
export interface WishlistKey {
  readonly profileId: string;
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
}

/** A row as the availability check reads it (spec wishlist-notifications R4). */
export interface CheckRow extends WishlistKey {
  readonly title: string;
  readonly seenInLibrary: boolean;
  readonly seenProviderIds: number[] | null;
  readonly mediaId: string | null;
}

/** The local media kind a TMDB kind matches (spec discover-wishlist R4). */
const LOCAL_KIND = { movie: 'film', tv: 'series' } as const;

/** Key of a TMDB title in the lookup maps. */
function key(kind: DiscoverKind, tmdbId: number): string {
  return `${kind}:${tmdbId}`;
}

/** Reads and writes `wishlist`, and matches TMDB titles to local media (UC26). */
export class WishlistRepository {
  constructor(private readonly db: AppDatabase) {}

  /** The titles with `mediaId` set when a local film / series carries their `tmdb_id`. */
  withMediaIds<T extends Pick<TitleFacts, 'kind' | 'tmdbId'>>(
    titles: readonly T[],
  ): (T & { mediaId: string | null })[] {
    const local = new Map<string, string>();
    for (const kind of ['movie', 'tv'] as const) {
      const ids = titles.filter((title) => title.kind === kind).map((title) => title.tmdbId);
      if (ids.length === 0) continue;
      const rows = this.db
        .select({ id: media.id, tmdbId: media.tmdbId })
        .from(media)
        .where(
          and(
            eq(media.kind, LOCAL_KIND[kind]),
            isNotNull(media.tmdbId),
            inArray(media.tmdbId, ids),
          ),
        )
        .all();
      for (const row of rows) {
        if (row.tmdbId !== null) local.set(key(kind, row.tmdbId), row.id);
      }
    }
    return titles.map((title) => ({
      ...title,
      mediaId: local.get(key(title.kind, title.tmdbId)) ?? null,
    }));
  }

  /** A profile's entries, newest first, each with its current availability (R6). */
  list(profileId: string): WishlistEntry[] {
    const rows = this.db
      .select({
        kind: wishlist.kind,
        tmdbId: wishlist.tmdbId,
        title: wishlist.title,
        year: wishlist.year,
        overview: wishlist.overview,
        voteAverage: wishlist.voteAverage,
        posterPath: wishlist.posterPath,
        addedAt: wishlist.addedAt,
      })
      .from(wishlist)
      .where(eq(wishlist.profileId, profileId))
      .orderBy(desc(wishlist.addedAt))
      .all();
    return this.withMediaIds(rows);
  }

  /**
   * Adds (or refreshes) a title on a profile's list; the caller checks the profile exists. A new
   * row starts from its current local match, its providers not looked at yet (spec
   * wishlist-notifications R4).
   */
  add(profileId: string, title: TitleFacts, now: Date = new Date()): void {
    const [match] = this.withMediaIds([title]);
    const row = {
      ...title,
      profileId,
      addedAt: now.toISOString(),
      seenInLibrary: (match?.mediaId ?? null) !== null,
    };
    this.db
      .insert(wishlist)
      .values(row)
      .onConflictDoUpdate({
        target: [wishlist.profileId, wishlist.kind, wishlist.tmdbId],
        set: {
          title: row.title,
          year: row.year,
          overview: row.overview,
          voteAverage: row.voteAverage,
          posterPath: row.posterPath,
        },
      })
      .run();
  }

  /** Forgets a title; removing an absent one is not an error (idempotent DELETE). */
  remove(profileId: string, kind: DiscoverKind, tmdbId: number): void {
    this.db
      .delete(wishlist)
      .where(
        and(
          eq(wishlist.profileId, profileId),
          eq(wishlist.kind, kind),
          eq(wishlist.tmdbId, tmdbId),
        ),
      )
      .run();
  }

  /** Every row with what the availability check last saw and its local match (R4). */
  checkRows(): CheckRow[] {
    const rows = this.db
      .select({
        profileId: wishlist.profileId,
        kind: wishlist.kind,
        tmdbId: wishlist.tmdbId,
        title: wishlist.title,
        seenInLibrary: wishlist.seenInLibrary,
        seenProviderIds: wishlist.seenProviderIds,
      })
      .from(wishlist)
      .all();
    return this.withMediaIds(rows);
  }

  /** Records what the check saw for a row; false when the row is gone (removed meanwhile). */
  saveSeen(row: WishlistKey, inLibrary: boolean, providerIds: readonly number[] | null): boolean {
    const result = this.db
      .update(wishlist)
      .set({
        seenInLibrary: inLibrary,
        seenProviderIds: providerIds === null ? null : [...providerIds],
      })
      .where(
        and(
          eq(wishlist.profileId, row.profileId),
          eq(wishlist.kind, row.kind),
          eq(wishlist.tmdbId, row.tmdbId),
        ),
      )
      .run();
    return result.changes > 0;
  }
}
