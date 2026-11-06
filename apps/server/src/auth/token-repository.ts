import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { Invitation, Role } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { authTokens } from '../db/schema.js';
import { hashToken, newToken } from './token.js';

const HOUR_MS = 3_600_000;
/** An invitation link is valid 72 h (UC15). */
export const INVITE_TTL_MS = 72 * HOUR_MS;
/** A reset link is valid 24 h (UC16). */
export const RESET_TTL_MS = 24 * HOUR_MS;

/** A freshly issued link token: the raw value is shown once, only its hash is stored. */
export interface IssuedToken {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
}

/** Single-use invitation and reset links (spec auth §4.1, UC15, UC16). */
export class TokenRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Issues a single-use invitation for `role`, valid 72 h (UC15); the raw token is returned once. */
  issueInvite(role: Role, now: Date): IssuedToken {
    return this.insert({ kind: 'invite', role, userId: null }, INVITE_TTL_MS, now);
  }

  /** A new reset link revokes the account's previous one (UC16). */
  issueReset(userId: string, now: Date): IssuedToken {
    this.revokeResets(userId, now);
    return this.insert({ kind: 'reset', role: null, userId }, RESET_TTL_MS, now);
  }

  /** Pending invitations, oldest first (UC15). */
  pendingInvites(now: Date): Invitation[] {
    return this.db
      .select({
        id: authTokens.id,
        role: authTokens.role,
        createdAt: authTokens.createdAt,
        expiresAt: authTokens.expiresAt,
      })
      .from(authTokens)
      .where(and(eq(authTokens.kind, 'invite'), this.pending(now)))
      .orderBy(asc(authTokens.createdAt))
      .all()
      .map((row) => ({ ...row, role: row.role ?? 'viewer' }));
  }

  /** Revokes a pending invitation; false when none matches. */
  revokeInvite(id: string, now: Date): boolean {
    const result = this.db
      .update(authTokens)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(authTokens.id, id), eq(authTokens.kind, 'invite'), this.pending(now)))
      .run();
    return result.changes === 1;
  }

  /** Revokes the account's pending reset link (UC16, UC17); true when one was revoked. */
  revokeResets(userId: string, now: Date): boolean {
    const result = this.db
      .update(authTokens)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.kind, 'reset'), this.pending(now)))
      .run();
    return result.changes > 0;
  }

  /** Whether `token` is a pending link of `kind`: a cheap check before hashing (spec auth R8). */
  isPending(token: string, kind: 'invite' | 'reset', now: Date): boolean {
    const row = this.db
      .select({ id: authTokens.id })
      .from(authTokens)
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.kind, kind),
          this.pending(now),
        ),
      )
      .get();
    return row !== undefined;
  }

  /** Spends a pending invitation and returns its role, or null (UC12). In the redeem transaction. */
  consumeInvite(token: string, now: Date): Role | null {
    return this.consume(token, 'invite', now)?.role ?? null;
  }

  /** Spends a pending reset link and returns its account, or null (UC20). In the redeem transaction. */
  consumeReset(token: string, now: Date): string | null {
    return this.consume(token, 'reset', now)?.userId ?? null;
  }

  /** Deletes used, revoked and expired tokens (spec auth §4.1). */
  purge(now: Date): void {
    this.db
      .delete(authTokens)
      .where(
        or(
          isNotNull(authTokens.usedAt),
          isNotNull(authTokens.revokedAt),
          lt(authTokens.expiresAt, now.toISOString()),
        ),
      )
      .run();
  }

  /**
   * Marks a pending token used (spec auth §4.1): the guarded update changes exactly one row,
   * so concurrent redeems cannot both win; a later failure in the transaction rolls it back.
   */
  private consume(token: string, kind: 'invite' | 'reset', now: Date) {
    return this.db
      .update(authTokens)
      .set({ usedAt: now.toISOString() })
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.kind, kind),
          this.pending(now),
        ),
      )
      .returning({ role: authTokens.role, userId: authTokens.userId })
      .get();
  }

  private insert(
    grant: { kind: 'invite' | 'reset'; role: Role | null; userId: string | null },
    ttlMs: number,
    now: Date,
  ): IssuedToken {
    const token = newToken();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    this.db
      .insert(authTokens)
      .values({
        id,
        tokenHash: hashToken(token),
        ...grant,
        createdAt: now.toISOString(),
        expiresAt,
      })
      .run();
    return { id, token, expiresAt };
  }

  private pending(now: Date) {
    return and(
      isNull(authTokens.usedAt),
      isNull(authTokens.revokedAt),
      gt(authTokens.expiresAt, now.toISOString()),
    );
  }
}
