import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Account, AuthEvent, Invitation, IssuedLink, User } from '@popcorntv/shared';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { authEvents, authTokens, profiles, users } from '../db/schema.js';
import { createAccount, fakeHasher, testAuthOptions } from '../test-fixtures.js';
import type { TestAccount } from '../test-fixtures.js';
import type { Hasher } from './hasher.js';
import { HasherBusyError } from './hasher.js';

const PASSWORD = 'a brand new passphrase';

interface Harness {
  readonly app: FastifyInstance;
  readonly db: AppDatabase;
  readonly owner: TestAccount;
}

let current: FastifyInstance | null = null;

afterEach(async () => {
  await current?.close();
  current = null;
});

async function harness(hasher: Hasher = fakeHasher): Promise<Harness> {
  const db = openDatabase(':memory:');
  const owner = createAccount(db);
  const app = await buildApp({
    version: 'test',
    db,
    probe: async () => ({ durationSec: null, streams: [] }),
    mediaRoot: tmpdir(),
    tmdb: null,
    artworkDir: tmpdir(),
    transcoder: () => {
      throw new Error('FFmpeg is not used by this suite');
    },
    transcodeDir: tmpdir(),
    ...testAuthOptions,
    hasher,
  });
  current = app;
  await app.ready();
  return { app, db, owner };
}

function as(
  h: Harness,
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return h.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
}

function tokenOf(response: LightMyRequestResponse, kind: 'invite' | 'reset'): string {
  const { link } = response.json<IssuedLink>();
  const token = link.split(`/#/${kind}/`)[1];
  if (token === undefined) throw new Error(`no ${kind} link in ${link}`);
  return token;
}

function redeem(h: Harness, payload: object) {
  return h.app.inject({ method: 'POST', url: '/auth/redeem', payload });
}

async function invite(h: Harness, role: 'owner' | 'viewer' = 'viewer'): Promise<string> {
  return tokenOf(await as(h, h.owner.cookie, 'POST', '/invitations', { role }), 'invite');
}

function cookieOf(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';')[0] ?? '';
}

describe('invitations (UC12, UC15)', () => {
  it('issues a 72 h link in the fragment, lists it, and a guest redeems it once', async () => {
    const h = await harness();

    const issued = await as(h, h.owner.cookie, 'POST', '/invitations', { role: 'viewer' });
    const token = tokenOf(issued, 'invite');
    const pending = await as(h, h.owner.cookie, 'GET', '/invitations');
    const accepted = await redeem(h, {
      kind: 'invite',
      token,
      username: 'guest',
      password: PASSWORD,
    });
    const again = await redeem(h, {
      kind: 'invite',
      token,
      username: 'guest2',
      password: PASSWORD,
    });

    expect(issued.statusCode).toBe(201);
    expect(issued.json<IssuedLink>().link).toMatch(
      /^http:\/\/localhost:5173\/#\/invite\/[\w-]{43}$/,
    );
    const ttl = Date.parse(issued.json<IssuedLink>().expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(71 * 3_600_000);
    expect(pending.json<Invitation[]>()).toHaveLength(1);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json<User>()).toMatchObject({ username: 'guest', role: 'viewer' });
    expect(cookieOf(accepted)).toMatch(/^pctv_session=/);
    const user = accepted.json<User>();
    expect(h.db.select().from(profiles).where(eq(profiles.userId, user.id)).all()).toHaveLength(1);
    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'token_invalid' });
    expect((await as(h, h.owner.cookie, 'GET', '/invitations')).json()).toEqual([]);
  });

  it('keeps the token usable when the username is taken', async () => {
    const h = await harness();
    const token = await invite(h);

    const taken = await redeem(h, { kind: 'invite', token, username: 'OWNER', password: PASSWORD });
    const retry = await redeem(h, { kind: 'invite', token, username: 'guest', password: PASSWORD });

    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual({ error: 'username_taken' });
    expect(retry.statusCode).toBe(200);
  });

  it('refuses a revoked invitation and a kind mismatch', async () => {
    const h = await harness();
    const token = await invite(h);
    const [pending] = (await as(h, h.owner.cookie, 'GET', '/invitations')).json<Invitation[]>();

    const mismatch = await redeem(h, { kind: 'reset', token, password: PASSWORD });
    const revoked = await as(h, h.owner.cookie, 'DELETE', `/invitations/${pending?.id ?? ''}`);
    const twice = await as(h, h.owner.cookie, 'DELETE', `/invitations/${pending?.id ?? ''}`);
    const late = await redeem(h, { kind: 'invite', token, username: 'guest', password: PASSWORD });

    expect(mismatch.statusCode).toBe(404);
    expect(revoked.statusCode).toBe(204);
    expect(twice.statusCode).toBe(404);
    expect(late.statusCode).toBe(404);
  });

  it('lets only one of two concurrent redeems win', async () => {
    const h = await harness();
    const token = await invite(h);

    const results = await Promise.all([
      redeem(h, { kind: 'invite', token, username: 'one', password: PASSWORD }),
      redeem(h, { kind: 'invite', token, username: 'two', password: PASSWORD }),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
  });

  it('grants the invited owner role', async () => {
    const h = await harness();

    const response = await redeem(h, {
      kind: 'invite',
      token: await invite(h, 'owner'),
      username: 'second',
      password: PASSWORD,
    });

    expect(response.json<User>().role).toBe('owner');
  });

  it('rate-limits wrong tokens per address without hashing them', async () => {
    const hash = vi.fn(fakeHasher.hash);
    const h = await harness({ ...fakeHasher, hash });
    for (let i = 0; i < 30; i += 1) {
      await redeem(h, { kind: 'reset', token: `wrong-${i}`, password: PASSWORD });
    }

    const locked = await redeem(h, { kind: 'reset', token: 'wrong', password: PASSWORD });

    expect(locked.statusCode).toBe(429);
    expect(locked.headers['retry-after']).toBeDefined();
    expect(hash).not.toHaveBeenCalled();
  });

  it('refunds a successful redeem and a taken username (spec auth R8)', async () => {
    const h = await harness();
    const token = await invite(h);
    // 29 of the 30 attempts: without the refunds, 409 and 200 would reach the limit.
    for (let i = 0; i < 29; i += 1) {
      await redeem(h, { kind: 'reset', token: `wrong-${i}`, password: PASSWORD });
    }

    const taken = await redeem(h, { kind: 'invite', token, username: 'owner', password: PASSWORD });
    const ok = await redeem(h, { kind: 'invite', token, username: 'guest', password: PASSWORD });
    const still = await redeem(h, { kind: 'reset', token: 'wrong', password: PASSWORD });
    const locked = await redeem(h, { kind: 'reset', token: 'wrong', password: PASSWORD });

    expect([taken.statusCode, ok.statusCode, still.statusCode, locked.statusCode]).toEqual([
      409, 200, 404, 429,
    ]);
  });

  it('answers 429 without counting when the hasher is saturated', async () => {
    const busy: Hasher = {
      hash: async () => {
        throw new HasherBusyError();
      },
      verify: fakeHasher.verify,
    };
    const h = await harness(busy);
    const token = await invite(h);
    const responses = [];
    for (let i = 0; i < 31; i += 1) {
      const payload = { kind: 'invite', token, username: 'guest', password: PASSWORD };
      responses.push(await redeem(h, payload));
    }

    expect(responses.every((r) => r.statusCode === 429)).toBe(true);
    expect(responses.every((r) => r.headers['retry-after'] === '2')).toBe(true);
  });

  it('answers 400 for a weak password', async () => {
    const h = await harness();

    const response = await redeem(h, {
      kind: 'invite',
      token: 'x',
      username: 'guest',
      password: 'short',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('reset links (UC16, UC20)', () => {
  it('sets the new password, ends every session and signs in', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    const issued = await as(h, h.owner.cookie, 'POST', `/users/${viewer.userId}/reset`);

    const response = await redeem(h, {
      kind: 'reset',
      token: tokenOf(issued, 'reset'),
      password: PASSWORD,
    });

    expect(issued.statusCode).toBe(201);
    expect(response.statusCode).toBe(200);
    expect(response.json<User>().username).toBe('kid');
    expect((await as(h, viewer.cookie, 'GET', '/auth/status')).json()).not.toHaveProperty('user');
    expect(h.db.select().from(users).where(eq(users.id, viewer.userId)).get()?.passwordHash).toBe(
      `fake:${PASSWORD}`,
    );
    const signedIn = await h.app.inject({
      method: 'GET',
      url: '/auth/status',
      headers: { cookie: cookieOf(response) },
    });
    expect(signedIn.json()).toHaveProperty('user.username', 'kid');
  });

  it('revokes the previous link when a new one is issued, and on revoke', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    const url = `/users/${viewer.userId}/reset`;
    const first = tokenOf(await as(h, h.owner.cookie, 'POST', url), 'reset');
    const second = tokenOf(await as(h, h.owner.cookie, 'POST', url), 'reset');

    const old = await redeem(h, { kind: 'reset', token: first, password: PASSWORD });
    const revoked = await as(h, h.owner.cookie, 'DELETE', url);
    const none = await as(h, h.owner.cookie, 'DELETE', url);
    const late = await redeem(h, { kind: 'reset', token: second, password: PASSWORD });

    expect(old.statusCode).toBe(404);
    expect(revoked.statusCode).toBe(204);
    expect(none.statusCode).toBe(404);
    expect(late.statusCode).toBe(404);
  });

  it('lifts the sign-in lockout of the account from this address', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    const signIn = (password: string) =>
      h.app.inject({
        method: 'POST',
        url: '/auth/session',
        payload: { username: 'kid', password },
      });
    for (let i = 0; i < 5; i += 1) await signIn('wrong password!');
    const token = tokenOf(
      await as(h, h.owner.cookie, 'POST', `/users/${viewer.userId}/reset`),
      'reset',
    );

    const locked = await signIn(PASSWORD);
    await redeem(h, { kind: 'reset', token, password: PASSWORD });
    const after = await signIn(PASSWORD);

    expect(locked.statusCode).toBe(429);
    expect(after.statusCode).toBe(200);
  });

  it('answers 404 for an unknown account', async () => {
    const h = await harness();

    const response = await as(h, h.owner.cookie, 'POST', `/users/${crypto.randomUUID()}/reset`);

    expect(response.statusCode).toBe(404);
  });
});

describe('account administration (UC17)', () => {
  it('lists accounts with their last sign-in and live devices', async () => {
    const h = await harness();
    createAccount(h.db, 'kid', 'viewer');

    const list = (await as(h, h.owner.cookie, 'GET', '/users')).json<Account[]>();

    expect(list.map((a) => [a.username, a.role, a.activeSessions])).toEqual([
      ['kid', 'viewer', 1],
      ['owner', 'owner', 1],
    ]);
    expect(list[0]).not.toHaveProperty('passwordHash');
    expect(list[0]?.lastLoginAt).toEqual(expect.any(String));
  });

  it('changes a role, which applies at once and revokes the pending reset', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    const reset = tokenOf(
      await as(h, h.owner.cookie, 'POST', `/users/${viewer.userId}/reset`),
      'reset',
    );

    const promoted = await as(h, h.owner.cookie, 'PATCH', `/users/${viewer.userId}`, {
      role: 'owner',
    });

    expect(promoted.json<User>().role).toBe('owner');
    expect((await as(h, viewer.cookie, 'GET', '/users')).statusCode).toBe(200);
    expect((await redeem(h, { kind: 'reset', token: reset, password: PASSWORD })).statusCode).toBe(
      404,
    );
  });

  it('protects the last owner from demotion and deletion', async () => {
    const h = await harness();
    const url = `/users/${h.owner.userId}`;

    const demoted = await as(h, h.owner.cookie, 'PATCH', url, { role: 'viewer' });
    const deleted = await as(h, h.owner.cookie, 'DELETE', url);

    expect(demoted.statusCode).toBe(409);
    expect(demoted.json()).toEqual({ error: 'last_owner' });
    expect(deleted.statusCode).toBe(409);
  });

  it('lets an owner step down once another owner exists', async () => {
    const h = await harness();
    createAccount(h.db, 'second', 'owner');

    const response = await as(h, h.owner.cookie, 'PATCH', `/users/${h.owner.userId}`, {
      role: 'viewer',
    });

    expect(response.statusCode).toBe(200);
    expect((await as(h, h.owner.cookie, 'GET', '/users')).statusCode).toBe(403);
  });

  it('lets an owner delete their own account once another owner exists', async () => {
    const h = await harness();
    createAccount(h.db, 'second', 'owner');

    const response = await as(h, h.owner.cookie, 'DELETE', `/users/${h.owner.userId}`);

    expect(response.statusCode).toBe(204);
    expect((await as(h, h.owner.cookie, 'GET', '/auth/status')).json()).toEqual({
      setupRequired: false,
    });
    const [last] = h.db.select().from(authEvents).orderBy(desc(authEvents.id)).limit(1).all();
    expect(last).toMatchObject({ kind: 'user_deleted', userId: null });
  });

  it.each([
    ['demoted', 'PATCH', { role: 'viewer' }],
    ['deleted', 'DELETE', undefined],
  ] as const)('revokes every pending link once their owner is %s', async (_case, method, body) => {
    const h = await harness();
    const second = createAccount(h.db, 'second', 'owner');
    const victim = createAccount(h.db, 'victim', 'viewer');
    const invitation = tokenOf(
      await as(h, second.cookie, 'POST', '/invitations', { role: 'owner' }),
      'invite',
    );
    const reset = tokenOf(
      await as(h, second.cookie, 'POST', `/users/${victim.userId}/reset`),
      'reset',
    );

    const removed = await as(h, h.owner.cookie, method, `/users/${second.userId}`, body);
    const invited = await redeem(h, {
      kind: 'invite',
      token: invitation,
      username: 'intruder',
      password: PASSWORD,
    });
    const taken = await redeem(h, { kind: 'reset', token: reset, password: PASSWORD });

    expect(removed.statusCode).toBeLessThan(300);
    expect(invited.statusCode).toBe(404);
    expect(taken.statusCode).toBe(404);
    expect((await as(h, victim.cookie, 'GET', '/auth/status')).json()).toHaveProperty(
      'user.username',
      'victim',
    );
  });

  it('keeps pending links when a viewer is deleted or promoted', async () => {
    const h = await harness();
    const promoted = createAccount(h.db, 'kid', 'viewer');
    const deleted = createAccount(h.db, 'guest', 'viewer');
    const invitation = await invite(h);

    await as(h, h.owner.cookie, 'PATCH', `/users/${promoted.userId}`, { role: 'owner' });
    await as(h, h.owner.cookie, 'DELETE', `/users/${deleted.userId}`);
    const accepted = await redeem(h, {
      kind: 'invite',
      token: invitation,
      username: 'newcomer',
      password: PASSWORD,
    });

    expect(accepted.statusCode).toBe(200);
  });

  it('deletes an account with its sessions, profiles and links', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    await as(h, h.owner.cookie, 'POST', `/users/${viewer.userId}/reset`);

    const response = await as(h, h.owner.cookie, 'DELETE', `/users/${viewer.userId}`);
    const again = await as(h, h.owner.cookie, 'DELETE', `/users/${viewer.userId}`);

    expect(response.statusCode).toBe(204);
    expect(again.statusCode).toBe(404);
    expect((await as(h, viewer.cookie, 'GET', '/auth/status')).json()).not.toHaveProperty('user');
    expect(h.db.select().from(profiles).where(eq(profiles.userId, viewer.userId)).all()).toEqual(
      [],
    );
    expect(h.db.select().from(authTokens).all()).toEqual([]);
  });

  it('lists and ends one device, then every device', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');
    const url = `/users/${viewer.userId}/sessions`;

    const devices = (await as(h, h.owner.cookie, 'GET', url)).json<
      Array<{ id: string; userAgent: string }>
    >();
    const one = await as(h, h.owner.cookie, 'DELETE', `${url}/${viewer.sessionId}`);
    const gone = await as(h, h.owner.cookie, 'DELETE', `${url}/${viewer.sessionId}`);
    const all = await as(h, h.owner.cookie, 'DELETE', url);

    expect(devices).toEqual([
      expect.objectContaining({ id: viewer.sessionId, userAgent: 'vitest' }),
    ]);
    expect(one.statusCode).toBe(204);
    expect(gone.json()).toEqual({ error: 'session_not_found' });
    expect(all.statusCode).toBe(204);
    expect((await as(h, h.owner.cookie, 'GET', url)).json()).toEqual([]);
  });

  it('refuses another account’s session id and an unknown account', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');

    const foreign = await as(
      h,
      h.owner.cookie,
      'DELETE',
      `/users/${viewer.userId}/sessions/${h.owner.sessionId}`,
    );
    const unknown = await as(h, h.owner.cookie, 'GET', `/users/${crypto.randomUUID()}/sessions`);
    const bad = await as(h, h.owner.cookie, 'GET', '/users/not-a-uuid/sessions');

    expect(foreign.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(bad.statusCode).toBe(400);
  });

  it('refuses a viewer on every administration route', async () => {
    const h = await harness();
    const viewer = createAccount(h.db, 'kid', 'viewer');

    const responses = await Promise.all([
      as(h, viewer.cookie, 'GET', '/users'),
      as(h, viewer.cookie, 'POST', '/invitations', { role: 'owner' }),
      as(h, viewer.cookie, 'GET', '/auth/events'),
      as(h, viewer.cookie, 'PATCH', `/users/${viewer.userId}`, { role: 'owner' }),
    ]);

    expect(responses.map((r) => r.statusCode)).toEqual([403, 403, 403, 403]);
  });

  it('answers 400 for an unknown role', async () => {
    const h = await harness();

    const response = await as(h, h.owner.cookie, 'PATCH', `/users/${h.owner.userId}`, {
      role: 'admin',
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('event list (UC18)', () => {
  it('returns the latest events newest first, with usernames and no secrets', async () => {
    const h = await harness();
    const token = await invite(h);
    await redeem(h, { kind: 'invite', token, username: 'guest', password: PASSWORD });

    const list = (await as(h, h.owner.cookie, 'GET', '/auth/events')).json<AuthEvent[]>();

    expect(list.map((e) => e.kind)).toEqual(['redeemed', 'invite_issued']);
    expect(list.map((e) => e.username)).toEqual(['guest', 'owner']);
    expect(JSON.stringify(list)).not.toContain(token);
  });
});
