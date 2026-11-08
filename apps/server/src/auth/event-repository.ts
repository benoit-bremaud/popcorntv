import { desc, eq, lt } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
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
  /**
   * Set by the caller only on failures and only for an existing account (spec auth R9); the
   * syntax check here is a second guard.
   */
  readonly usernameTried?: string;
}

/** Kinds logged at `warn`: an attack or a typo worth noticing (spec logging R5). */
const WARN_KINDS: ReadonlySet<AuthEventKind> = new Set(['login_failed', 'login_locked']);

/**
 * Writes `auth_events` (spec auth R9); UC18 lists them. Each row is also one `auth.<kind>`
 * log line with the same facts (ADR-0021), except `usernameTried`, which stays in the
 * owner-only table: stdout ends up in Docker logs.
 */
export class EventRepository {
  constructor(
    private readonly db: AppDatabase,
    private readonly logger?: Pick<FastifyBaseLogger, 'info' | 'warn'>,
  ) {}

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
    this.logger?.[WARN_KINDS.has(kind) ? 'warn' : 'info'](
      { event: `auth.${kind}`, userId: input.userId ?? undefined, ip: input.ip ?? undefined },
      `auth event ${kind}`,
    );
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
