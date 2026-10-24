import { randomUUID } from 'node:crypto';
import { asc, count, eq } from 'drizzle-orm';
import { PROFILE_LIMIT } from '@popcorntv/shared';
import type { CreateProfileBody, Profile, UpdateProfileBody } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { profiles } from '../db/schema.js';

/** Why a profile write was refused (spec profiles §3, extensions). */
export type ProfileRefusal = 'profile_not_found' | 'profile_name_taken' | 'profile_limit';

/** Result of `create` / `update`: the stored profile, or why the write was refused. */
export type ProfileWrite =
  | { readonly ok: true; readonly profile: Profile }
  | {
      readonly ok: false;
      readonly reason: ProfileRefusal;
    };

const columns = { id: profiles.id, name: profiles.name, avatar: profiles.avatar };

/** Reads and writes `profiles` (spec profiles §4.1); deleting one cascades its progress. */
export class ProfileRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Every profile, oldest first. */
  list(): Profile[] {
    return this.db.select(columns).from(profiles).orderBy(asc(profiles.createdAt)).all();
  }

  /** Lets callers answer 404 before writing a row that references the profile. */
  exists(id: string): boolean {
    return (
      this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, id)).get() !==
      undefined
    );
  }

  /**
   * Adds a profile (`name` trimmed by the caller). Refuses past `PROFILE_LIMIT` and a name
   * whose lower-cased key exists. better-sqlite3 is synchronous, so the checks and the
   * insert cannot interleave in one process; the unique `name_key` index is the backstop
   * across processes, mapped to `profile_name_taken` too.
   */
  create(body: CreateProfileBody, now: Date = new Date()): ProfileWrite {
    if (this.size() >= PROFILE_LIMIT) return { ok: false, reason: 'profile_limit' };
    if (this.nameTaken(body.name, null)) return { ok: false, reason: 'profile_name_taken' };
    const profile: Profile = { id: randomUUID(), name: body.name, avatar: body.avatar };
    const write = () =>
      this.db
        .insert(profiles)
        .values({ ...profile, nameKey: nameKey(body.name), createdAt: now.toISOString() })
        .run();
    return uniqueName(write) ? { ok: true, profile } : { ok: false, reason: 'profile_name_taken' };
  }

  /**
   * Renames and / or recolours a profile (`name` trimmed by the caller); refuses an unknown
   * id and another profile's name, like `create`.
   */
  update(id: string, body: UpdateProfileBody): ProfileWrite {
    const current = this.find(id);
    if (current === undefined) return { ok: false, reason: 'profile_not_found' };
    if (body.name !== undefined && this.nameTaken(body.name, id)) {
      return { ok: false, reason: 'profile_name_taken' };
    }
    const profile: Profile = { ...current, ...body };
    const write = () =>
      this.db
        .update(profiles)
        .set({ name: profile.name, nameKey: nameKey(profile.name), avatar: profile.avatar })
        .where(eq(profiles.id, id))
        .run();
    return uniqueName(write) ? { ok: true, profile } : { ok: false, reason: 'profile_name_taken' };
  }

  /** Deletes a profile and its progress; refuses the last one so the picker is never empty. */
  remove(id: string): 'removed' | 'profile_not_found' | 'last_profile' {
    if (!this.exists(id)) return 'profile_not_found';
    if (this.size() <= 1) return 'last_profile';
    this.db.delete(profiles).where(eq(profiles.id, id)).run();
    return 'removed';
  }

  private find(id: string): Profile | undefined {
    return this.db.select(columns).from(profiles).where(eq(profiles.id, id)).get();
  }

  private size(): number {
    return this.db.select({ n: count() }).from(profiles).get()?.n ?? 0;
  }

  private nameTaken(name: string, exceptId: string | null): boolean {
    const row = this.db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.nameKey, nameKey(name)))
      .get();
    return row !== undefined && row.id !== exceptId;
  }
}

/** Runs a write; false when it hit the unique `name_key` index, any other error rethrows. */
function uniqueName(write: () => unknown): boolean {
  try {
    write();
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return false;
    }
    throw error;
  }
}

function nameKey(name: string): string {
  return name.toLowerCase();
}
