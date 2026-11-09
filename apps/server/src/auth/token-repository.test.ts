import { describe, expect, it } from 'vitest';
import { openDatabase } from '../db/index.js';
import { authTokens } from '../db/schema.js';
import { createAccount } from '../test-fixtures.js';
import { INVITE_TTL_MS, RESET_TTL_MS, TokenRepository } from './token-repository.js';

const T0 = new Date('2026-11-05T10:00:00.000Z');
const later = (ms: number) => new Date(T0.getTime() + ms);

function setUp() {
  const db = openDatabase(':memory:');
  const { userId } = createAccount(db, 'kid', 'viewer');
  return { db, userId, tokens: new TokenRepository(db) };
}

describe('TokenRepository', () => {
  it('revokes every pending link and leaves spent and expired ones as they were', () => {
    const { db, tokens, userId } = setUp();
    const spent = tokens.issueInvite('viewer', T0).token;
    tokens.consumeInvite(spent, T0);
    const expired = tokens.issueInvite('viewer', T0).token;
    const now = later(INVITE_TTL_MS + 1);
    const invite = tokens.issueInvite('owner', now).token;
    const reset = tokens.issueReset(userId, now).token;

    tokens.revokeAllPending(now);

    expect(tokens.isPending(invite, 'invite', now)).toBe(false);
    expect(tokens.isPending(reset, 'reset', now)).toBe(false);
    const revoked = db
      .select()
      .from(authTokens)
      .all()
      .filter((t) => t.revokedAt !== null);
    expect(revoked).toHaveLength(2);
    expect(tokens.isPending(expired, 'invite', now)).toBe(false);
  });

  it('spends an invitation once and returns its role', () => {
    const { tokens } = setUp();
    const { token } = tokens.issueInvite('owner', T0);

    expect(tokens.isPending(token, 'invite', T0)).toBe(true);
    expect(tokens.consumeInvite(token, T0)).toBe('owner');
    expect(tokens.consumeInvite(token, T0)).toBeNull();
    expect(tokens.isPending(token, 'invite', T0)).toBe(false);
  });

  it('refuses a token of the other kind', () => {
    const { tokens, userId } = setUp();
    const invite = tokens.issueInvite('viewer', T0).token;
    const reset = tokens.issueReset(userId, T0).token;

    expect(tokens.consumeReset(invite, T0)).toBeNull();
    expect(tokens.consumeInvite(reset, T0)).toBeNull();
  });

  it.each([
    ['invite', INVITE_TTL_MS],
    ['reset', RESET_TTL_MS],
  ] as const)('expires a %s link after its lifetime', (kind, ttl) => {
    const { tokens, userId } = setUp();
    const { token } =
      kind === 'invite' ? tokens.issueInvite('viewer', T0) : tokens.issueReset(userId, T0);

    expect(tokens.isPending(token, kind, later(ttl - 1))).toBe(true);
    expect(tokens.isPending(token, kind, later(ttl))).toBe(false);
    const spent =
      kind === 'invite'
        ? tokens.consumeInvite(token, later(ttl))
        : tokens.consumeReset(token, later(ttl));
    expect(spent).toBeNull();
  });

  it('revokes invitations, and the previous reset when a new one is issued', () => {
    const { tokens, userId } = setUp();
    const invite = tokens.issueInvite('viewer', T0);
    const first = tokens.issueReset(userId, T0).token;
    const second = tokens.issueReset(userId, T0).token;

    expect(tokens.revokeInvite(invite.id, T0)).toBe(true);
    expect(tokens.revokeInvite(invite.id, T0)).toBe(false);
    expect(tokens.consumeInvite(invite.token, T0)).toBeNull();
    expect(tokens.consumeReset(first, T0)).toBeNull();
    expect(tokens.consumeReset(second, T0)).toBe(userId);
    expect(tokens.revokeResets(userId, T0)).toBe(false);
  });

  it('lists the accounts with a pending reset only, not invitations nor spent resets', () => {
    const { db, tokens, userId } = setUp();
    const other = createAccount(db, 'guest', 'viewer').userId;
    const revokedOf = createAccount(db, 'gone', 'viewer').userId;
    tokens.issueInvite('viewer', T0);
    tokens.issueReset(userId, T0);
    tokens.issueReset(userId, T0);
    tokens.issueReset(other, T0);
    tokens.issueReset(revokedOf, T0);
    tokens.revokeResets(revokedOf, T0);

    expect(tokens.pendingResetUsers(T0)).toEqual(new Set([userId, other]));
  });

  it('drops an expired reset from the pending accounts', () => {
    const { tokens, userId } = setUp();
    tokens.issueReset(userId, T0);

    expect(tokens.pendingResetUsers(later(RESET_TTL_MS - 1))).toEqual(new Set([userId]));
    expect(tokens.pendingResetUsers(later(RESET_TTL_MS))).toEqual(new Set());
  });

  it('lists pending invitations only, oldest first', () => {
    const { tokens } = setUp();
    const spent = tokens.issueInvite('viewer', T0);
    tokens.issueInvite('owner', later(1));
    tokens.issueInvite('viewer', later(2));
    tokens.consumeInvite(spent.token, later(3));

    expect(tokens.pendingInvites(later(3)).map((i) => i.role)).toEqual(['owner', 'viewer']);
    expect(tokens.pendingInvites(later(INVITE_TTL_MS + 2))).toEqual([]);
  });

  it('purges used, revoked and expired tokens, keeping pending ones', () => {
    const { db, tokens, userId } = setUp();
    const used = tokens.issueInvite('viewer', T0);
    tokens.consumeInvite(used.token, T0);
    const revoked = tokens.issueInvite('viewer', T0);
    tokens.revokeInvite(revoked.id, T0);
    tokens.issueReset(userId, T0);
    const pending = tokens.issueInvite('viewer', later(RESET_TTL_MS));

    tokens.purge(later(RESET_TTL_MS + 1));

    expect(db.select({ id: authTokens.id }).from(authTokens).all()).toEqual([{ id: pending.id }]);
  });
});
