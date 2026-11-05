import { desc, eq, lt } from 'drizzle-orm';
import { USERNAME_PATTERN } from '@popcorntv/shared';
import type { AuthEvent } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { authEvents, users } from '../db/schema.js';
import type { AuthEventKind } from '../db/schema.js';

/** Events older than this are purged (spec auth R9). */
const RETENTION_MS = 90 * 86_400_000;

/** Context of one audit event; never a password or a token. */
export interface AuthEventInput {
  readonly userId?: string | null;
  readonly ip?: string | null;
  /** Kept only on failures and only when it matches the username syntax (spec auth R9). */
  readonly usernameTried?: string;
}

/** Writes `auth_events` (spec auth R9); UC18 lists them. */
export class EventRepository {
  constructor(private readonly db: AppDatabase) {}

  record(kind: AuthEventKind, input: AuthEventInput, now: Date = new Date()): void {
    const tried = input.usernameTried;
    this.db
      .insert(authEvents)
      .values({
        at: now.toISOString(),
        kind,
        userId: input.userId ?? null,
        ip: input.ip ?? null,
        usernameTried: tried !== undefined && USERNAME_PATTERN.test(tried) ? tried : null,
      })
      .run();
  }

  /** The latest events, newest first, with the account's current username (UC18). */
  list(limit = 200): AuthEvent[] {
    return this.db
      .select({
        id: authEvents.id,
        at: authEvents.at,
        kind: authEvents.kind,
        userId: authEvents.userId,
        username: users.username,
        ip: authEvents.ip,
        usernameTried: authEvents.usernameTried,
      })
      .from(authEvents)
      .leftJoin(users, eq(users.id, authEvents.userId))
      .orderBy(desc(authEvents.id))
      .limit(limit)
      .all();
  }

  purge(now: Date): void {
    const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
    this.db.delete(authEvents).where(lt(authEvents.at, cutoff)).run();
  }
}
