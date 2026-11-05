import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { ABSOLUTE_MS, IDLE_MS, MAX_SESSIONS, SessionRepository } from './session-repository.js';
import { hashToken } from './token.js';
import { UserRepository } from './user-repository.js';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 3_600_000;

function setup(): { db: AppDatabase; repo: SessionRepository; userId: string } {
  const db = openDatabase(':memory:');
  const userId = new UserRepository(db).create('alice', 'hash', 'viewer', T0).id;
  return { db, repo: new SessionRepository(db), userId };
}

function row(db: AppDatabase, id: string) {
  return db.select().from(sessions).where(eq(sessions.id, id)).get();
}

describe('SessionRepository', () => {
  it('stores only the SHA-256 of the token and resolves the user from it', () => {
    const { db, repo, userId } = setup();

    const issued = repo.create(userId, 'Firefox', T0);

    expect(row(db, issued.id)).toMatchObject({
      tokenHash: hashToken(issued.token),
      userAgent: 'Firefox',
      expiresAt: at(ABSOLUTE_MS).toISOString(),
    });
    expect(repo.resolve(issued.token, T0)).toEqual({
      sessionId: issued.id,
      userId,
      username: 'alice',
      role: 'viewer',
    });
    expect(repo.resolve('not-a-token', T0)).toBeNull();
  });

  it('truncates the user agent to 200 characters', () => {
    const { db, repo, userId } = setup();

    const issued = repo.create(userId, 'x'.repeat(500), T0);

    expect(row(db, issued.id)?.userAgent).toHaveLength(200);
  });

  it('expires after 14 idle days and slides last_seen_at at most hourly', () => {
    const { db, repo, userId } = setup();
    const { id, token } = repo.create(userId, undefined, T0);

    repo.resolve(token, at(HOUR - 1));
    expect(row(db, id)?.lastSeenAt).toBe(T0.toISOString());
    repo.resolve(token, at(HOUR));
    expect(row(db, id)?.lastSeenAt).toBe(at(HOUR).toISOString());

    expect(repo.resolve(token, at(HOUR + IDLE_MS - 1))).not.toBeNull();
    expect(repo.resolve(token, at(2 * HOUR + IDLE_MS + IDLE_MS))).toBeNull();
  });

  it('expires 90 days after creation however active it stays', () => {
    const { repo, userId } = setup();
    const { token } = repo.create(userId, undefined, T0);
    for (let day = 10; day < 90; day += 10) repo.resolve(token, at(day * 86_400_000));

    expect(repo.resolve(token, at(ABSOLUTE_MS - 1))).not.toBeNull();
    expect(repo.resolve(token, at(ABSOLUTE_MS))).toBeNull();
  });

  it('revokes one session, or all of a user but one', () => {
    const { repo, userId } = setup();
    const a = repo.create(userId, undefined, T0);
    const b = repo.create(userId, undefined, T0);
    const c = repo.create(userId, undefined, T0);

    repo.revoke(a.id, T0);
    repo.revokeAll(userId, T0, c.id);

    expect(repo.resolve(a.token, T0)).toBeNull();
    expect(repo.resolve(b.token, T0)).toBeNull();
    expect(repo.resolve(c.token, T0)).not.toBeNull();
    repo.revokeAll(userId, T0);
    expect(repo.resolve(c.token, T0)).toBeNull();
  });

  it('rotates a token: the old one stops working, the session stays', () => {
    const { repo, userId } = setup();
    const { id, token } = repo.create(userId, undefined, T0);

    const rotated = repo.rotate(id);

    expect(repo.resolve(token, T0)).toBeNull();
    expect(repo.resolve(rotated, T0)?.sessionId).toBe(id);
  });

  it(`keeps at most ${MAX_SESSIONS} live sessions, revoking the oldest`, () => {
    const { repo, userId } = setup();
    const issued = Array.from({ length: MAX_SESSIONS + 1 }, (_, i) =>
      repo.create(userId, undefined, at(i)),
    );

    expect(repo.resolve(issued[0]?.token ?? '', at(100))).toBeNull();
    expect(repo.resolve(issued[1]?.token ?? '', at(100))).not.toBeNull();
    expect(repo.resolve(issued[MAX_SESSIONS]?.token ?? '', at(100))).not.toBeNull();
  });

  it('purges revoked, idle and expired sessions only', () => {
    const { db, repo, userId } = setup();
    const revoked = repo.create(userId, undefined, T0);
    const idle = repo.create(userId, undefined, T0);
    const live = repo.create(userId, undefined, at(IDLE_MS));
    repo.revoke(revoked.id, T0);

    repo.purge(at(IDLE_MS + 1));

    expect(row(db, revoked.id)).toBeUndefined();
    expect(row(db, idle.id)).toBeUndefined();
    expect(row(db, live.id)).toBeDefined();
  });

  it('reads the role fresh and dies with the account', () => {
    const { db, repo, userId } = setup();
    const { token } = repo.create(userId, undefined, T0);

    db.run(sql`update users set role = 'owner' where id = ${userId}`);
    expect(repo.resolve(token, T0)?.role).toBe('owner');
    db.run(sql`delete from users where id = ${userId}`);
    expect(repo.resolve(token, T0)).toBeNull();
  });
});
