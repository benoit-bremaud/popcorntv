import { lt } from 'drizzle-orm';
import { USERNAME_PATTERN } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { authEvents } from '../db/schema.js';
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

/** Writes `auth_events` (spec auth R9); UC18 reads them in lot 2. */
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

  purge(now: Date): void {
    const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
    this.db.delete(authEvents).where(lt(authEvents.at, cutoff)).run();
  }
}
