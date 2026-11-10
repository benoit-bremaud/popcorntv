import { and, eq } from 'drizzle-orm';
import type { DiscoverKind } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { titleLinks } from '../db/schema.js';

/** Reads and writes the owner's link per TMDB title (UC30, ADR-0031). */
export class TitleLinkRepository {
  constructor(private readonly db: AppDatabase) {}

  /** The stored link of a title, or null. */
  get(kind: DiscoverKind, tmdbId: number): string | null {
    const row = this.db
      .select({ url: titleLinks.url })
      .from(titleLinks)
      .where(and(eq(titleLinks.kind, kind), eq(titleLinks.tmdbId, tmdbId)))
      .get();
    return row?.url ?? null;
  }

  /** Stores or replaces the link of a title; `url` is already validated. */
  set(kind: DiscoverKind, tmdbId: number, url: string, now: Date = new Date()): void {
    const updatedAt = now.toISOString();
    this.db
      .insert(titleLinks)
      .values({ kind, tmdbId, url, updatedAt })
      .onConflictDoUpdate({ target: [titleLinks.kind, titleLinks.tmdbId], set: { url, updatedAt } })
      .run();
  }

  /** Forgets the link of a title; true when one existed. */
  remove(kind: DiscoverKind, tmdbId: number): boolean {
    const result = this.db
      .delete(titleLinks)
      .where(and(eq(titleLinks.kind, kind), eq(titleLinks.tmdbId, tmdbId)))
      .run();
    return result.changes > 0;
  }
}
