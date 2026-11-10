import { and, asc, count, eq } from 'drizzle-orm';
import type { MyProvider } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { profileProviders } from '../db/schema.js';

/** Reads and writes the providers a profile subscribes to (UC29, spec wishlist-notifications R1). */
export class MyProviderRepository {
  constructor(private readonly db: AppDatabase) {}

  /** A profile's providers, sorted by name. */
  list(profileId: string): MyProvider[] {
    return this.db
      .select({ providerId: profileProviders.providerId, name: profileProviders.name })
      .from(profileProviders)
      .where(eq(profileProviders.profileId, profileId))
      .orderBy(asc(profileProviders.name))
      .all();
  }

  /** The provider ids of every profile that has any. */
  idsByProfile(): Map<string, Set<number>> {
    const byProfile = new Map<string, Set<number>>();
    const rows = this.db
      .select({ profileId: profileProviders.profileId, providerId: profileProviders.providerId })
      .from(profileProviders)
      .all();
    for (const row of rows) {
      const ids = byProfile.get(row.profileId) ?? new Set<number>();
      ids.add(row.providerId);
      byProfile.set(row.profileId, ids);
    }
    return byProfile;
  }

  /** Adds or renames one; false when it is new and the profile already has `max`. */
  put(profileId: string, provider: MyProvider, max: number): boolean {
    return this.db.transaction((tx) => {
      const existing = tx
        .select({ providerId: profileProviders.providerId })
        .from(profileProviders)
        .where(
          and(
            eq(profileProviders.profileId, profileId),
            eq(profileProviders.providerId, provider.providerId),
          ),
        )
        .get();
      if (!existing) {
        const [row] = tx
          .select({ n: count() })
          .from(profileProviders)
          .where(eq(profileProviders.profileId, profileId))
          .all();
        if ((row?.n ?? 0) >= max) return false;
      }
      tx.insert(profileProviders)
        .values({ profileId, ...provider })
        .onConflictDoUpdate({
          target: [profileProviders.profileId, profileProviders.providerId],
          set: { name: provider.name },
        })
        .run();
      return true;
    });
  }

  /** Forgets one; removing an absent one is not an error (idempotent DELETE). */
  remove(profileId: string, providerId: number): void {
    this.db
      .delete(profileProviders)
      .where(
        and(eq(profileProviders.profileId, profileId), eq(profileProviders.providerId, providerId)),
      )
      .run();
  }
}
