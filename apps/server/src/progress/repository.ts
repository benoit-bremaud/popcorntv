import { and, desc, eq, inArray } from 'drizzle-orm';
import { isFinished } from '@popcorntv/shared';
import type { WatchProgress } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { media, watchProgress } from '../db/schema.js';

/** Reads and writes `watch_progress` (spec resume-playback §2.1). */
export class ProgressRepository {
  constructor(private readonly db: AppDatabase) {}

  /**
   * Upserts a profile's position in a playable media, clamped to its duration when known.
   * False for an unknown media or a `series` row (it has no file to play); the caller
   * checks the profile exists.
   */
  save(profileId: string, mediaId: string, positionSec: number, now: Date = new Date()): boolean {
    const row = this.db
      .select({ kind: media.kind, durationSec: media.durationSec })
      .from(media)
      .where(eq(media.id, mediaId))
      .get();
    if (row === undefined || row.kind === 'series') return false;
    const position =
      row.durationSec === null ? positionSec : Math.min(positionSec, row.durationSec);
    const updatedAt = now.toISOString();
    this.db
      .insert(watchProgress)
      .values({ profileId, mediaId, positionSec: position, updatedAt })
      .onConflictDoUpdate({
        target: [watchProgress.profileId, watchProgress.mediaId],
        set: { positionSec: position, updatedAt },
      })
      .run();
    return true;
  }

  /** Every position of a profile, newest first. */
  list(profileId: string): WatchProgress[] {
    return this.db
      .select({
        mediaId: watchProgress.mediaId,
        positionSec: watchProgress.positionSec,
        durationSec: media.durationSec,
        updatedAt: watchProgress.updatedAt,
        watchedAt: watchProgress.watchedAt,
      })
      .from(watchProgress)
      .innerJoin(media, eq(media.id, watchProgress.mediaId))
      .where(eq(watchProgress.profileId, profileId))
      .orderBy(desc(watchProgress.updatedAt))
      .all()
      .map(({ watchedAt, ...row }) => ({
        ...row,
        finished: watchedAt !== null || isFinished(row),
      }));
  }

  /**
   * Marks a playable media watched (keeping its position) or unwatched (forgetting it); a
   * `series` row applies to each of its episodes (spec watched-marks R2, R3). False for an
   * unknown media; the caller checks the profile exists.
   */
  setWatched(
    profileId: string,
    mediaId: string,
    watched: boolean,
    now: Date = new Date(),
  ): boolean {
    const row = this.db.select({ kind: media.kind }).from(media).where(eq(media.id, mediaId)).get();
    if (row === undefined) return false;
    const ids =
      row.kind === 'series'
        ? this.db
            .select({ id: media.id })
            .from(media)
            .where(eq(media.seriesId, mediaId))
            .all()
            .map((episode) => episode.id)
        : [mediaId];
    if (ids.length === 0) return true;
    if (!watched) {
      this.db
        .delete(watchProgress)
        .where(and(eq(watchProgress.profileId, profileId), inArray(watchProgress.mediaId, ids)))
        .run();
      return true;
    }
    const at = now.toISOString();
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.insert(watchProgress)
          .values({ profileId, mediaId: id, positionSec: 0, updatedAt: at, watchedAt: at })
          .onConflictDoUpdate({
            target: [watchProgress.profileId, watchProgress.mediaId],
            set: { updatedAt: at, watchedAt: at },
          })
          .run();
      }
    });
    return true;
  }
}
