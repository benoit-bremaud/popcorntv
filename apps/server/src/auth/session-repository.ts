import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import type { Role } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { hashToken, newToken } from './token.js';

const DAY_MS = 86_400_000;
/** Idle limit: `last_seen_at` + 14 days (spec auth R5). */
export const IDLE_MS = 14 * DAY_MS;
/** Absolute limit: `created_at` + 90 days (spec auth R5). */
export const ABSOLUTE_MS = 90 * DAY_MS;
/** `last_seen_at` is written at most this often per session (spec auth §4.1). */
const SLIDE_MS = 60 * 60_000;
/** Active sessions per user; the oldest is revoked first (spec auth R5). */
export const MAX_SESSIONS = 20;
const USER_AGENT_MAX = 200;

/** Who a valid session belongs to, read fresh on every request (spec auth R2). */
export interface ResolvedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly username: string;
  readonly role: Role;
}

/** A newly issued session: the raw token goes into the cookie, never into the database. */
export interface IssuedSession {
  readonly id: string;
  readonly token: string;
}

/** Server-side sessions (ADR-0010 §2): only the SHA-256 of the token is stored. */
export class SessionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Starts a session and revokes the user's oldest ones beyond `MAX_SESSIONS`. */
  create(userId: string, userAgent: string | undefined, now: Date): IssuedSession {
    const token = newToken();
    const id = randomUUID();
    this.db
      .insert(sessions)
      .values({
        id,
        userId,
        tokenHash: hashToken(token),
        createdAt: now.toISOString(),
        lastSeenAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ABSOLUTE_MS).toISOString(),
        userAgent: userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      })
      .run();
    this.enforceCap(userId, now);
    return { id, token };
  }

  /**
   * The live session for a cookie token, or null when unknown, revoked, idle past 14 days
   * or past 90 days. Slides `last_seen_at` when the last write is over an hour old.
   */
  resolve(token: string, now: Date): ResolvedSession | null {
    const row = this.db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        username: users.username,
        role: users.role,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), this.live(now)))
      .get();
    if (row === undefined) return null;
    if (now.getTime() - Date.parse(row.lastSeenAt) >= SLIDE_MS) {
      this.db
        .update(sessions)
        .set({ lastSeenAt: now.toISOString() })
        .where(eq(sessions.id, row.sessionId))
        .run();
    }
    return { sessionId: row.sessionId, userId: row.userId, username: row.username, role: row.role };
  }

  /** Gives the session a new token (password change, spec auth R5); the old one stops working. */
  rotate(sessionId: string): string {
    const token = newToken();
    this.db
      .update(sessions)
      .set({ tokenHash: hashToken(token) })
      .where(eq(sessions.id, sessionId))
      .run();
    return token;
  }

  revoke(sessionId: string, now: Date): void {
    this.db
      .update(sessions)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .run();
  }

  /** Ends every session of a user, except `keepId` when given. */
  revokeAll(userId: string, now: Date, keepId?: string): void {
    this.db
      .update(sessions)
      .set({ revokedAt: now.toISOString() })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          keepId === undefined ? undefined : ne(sessions.id, keepId),
        ),
      )
      .run();
  }

  /** Deletes revoked and expired sessions (spec auth §4.1, at start and on each sign-in). */
  purge(now: Date): void {
    this.db
      .delete(sessions)
      .where(
        or(
          isNotNull(sessions.revokedAt),
          lt(sessions.expiresAt, now.toISOString()),
          lt(sessions.lastSeenAt, new Date(now.getTime() - IDLE_MS).toISOString()),
        ),
      )
      .run();
  }

  private live(now: Date) {
    return and(
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, now.toISOString()),
      gt(sessions.lastSeenAt, new Date(now.getTime() - IDLE_MS).toISOString()),
    );
  }

  private enforceCap(userId: string, now: Date): void {
    const active = this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), this.live(now)))
      .orderBy(asc(sessions.createdAt), asc(sessions.lastSeenAt))
      .all();
    const excess = active.slice(0, Math.max(active.length - MAX_SESSIONS, 0)).map((s) => s.id);
    if (excess.length === 0) return;
    this.db
      .update(sessions)
      .set({ revokedAt: now.toISOString() })
      .where(inArray(sessions.id, excess))
      .run();
  }
}
