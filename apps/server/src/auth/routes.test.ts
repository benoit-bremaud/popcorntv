import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { AuthStatus, Profile, User } from '@popcorntv/shared';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import { authEvents, users } from '../db/schema.js';
import { TEST_PUBLIC_URL, createAccount, fakeHasher } from '../test-fixtures.js';
import type { Hasher } from './hasher.js';
import { HasherBusyError } from './hasher.js';
import { TokenRepository } from './token-repository.js';

const PASSWORD = 'correct horse battery';

interface Harness {
  readonly app: FastifyInstance;
  readonly db: AppDatabase;
  /** The setup link printed at start, while no user exists. */
  readonly setupLink: string | null;
}

let current: FastifyInstance | null = null;

afterEach(async () => {
  await current?.close();
  current = null;
});

async function harness(
  options: { db?: AppDatabase; hasher?: Hasher; publicUrl?: string; trustProxy?: string } = {},
): Promise<Harness> {
  const db = options.db ?? openDatabase(':memory:');
  let setupLink: string | null = null;
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
    publicUrl: options.publicUrl ?? TEST_PUBLIC_URL,
    hasher: options.hasher ?? fakeHasher,
    trustProxy: options.trustProxy,
    onSetupLink: (link) => {
      setupLink = link;
    },
  });
  current = app;
  await app.ready();
  return { app, db, setupLink };
}

/** The `name=value` part of the response's `Set-Cookie`, ready to send back. */
function cookieOf(response: LightMyRequestResponse): string {
  const header = response.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) throw new Error('no Set-Cookie');
  return value.split(';')[0] ?? '';
}

function tokenOf(link: string | null): string {
  const token = link?.split('/#/setup/')[1];
  if (token === undefined) throw new Error('no setup link');
  return token;
}

async function setUp(h: Harness, username = 'owner') {
  return h.app.inject({
    method: 'POST',
    url: '/auth/setup',
    payload: { token: tokenOf(h.setupLink), username, password: PASSWORD },
  });
}

function signIn(app: FastifyInstance, username: string, password: string, cookie?: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/session',
    payload: { username, password },
    headers: cookie ? { cookie } : {},
  });
}

function events(db: AppDatabase) {
  return db.select().from(authEvents).orderBy(asc(authEvents.id)).all();
}

describe('first-owner setup (UC11)', () => {
  it('prints a setup link while no user exists and reports setupRequired', async () => {
    const h = await harness();

    const status = await h.app.inject({ method: 'GET', url: '/auth/status' });

    expect(h.setupLink).toMatch(/^http:\/\/localhost:5173\/#\/setup\/[\w-]{43}$/);
    expect(status.json<AuthStatus>()).toEqual({ setupRequired: true });
  });

  it('creates the owner, adopts the orphan profiles and starts a session', async () => {
    const h = await harness();

    const response = await setUp(h, 'Benoit');
    const cookie = cookieOf(response);
    const status = await h.app.inject({ method: 'GET', url: '/auth/status', headers: { cookie } });
    const profiles = await h.app.inject({ method: 'GET', url: '/profiles', headers: { cookie } });

    expect(response.statusCode).toBe(201);
    expect(response.json<User>()).toMatchObject({ username: 'Benoit', role: 'owner' });
    expect(response.headers['set-cookie']).toContain('HttpOnly; SameSite=Lax');
    expect(status.json<AuthStatus>()).toMatchObject({
      setupRequired: false,
      user: { username: 'Benoit', role: 'owner' },
    });
    expect(profiles.json<Profile[]>().map((p) => p.id)).toEqual(['default']);
    expect(events(h.db).map((e) => e.kind)).toEqual(['setup_done']);
  });

  it('works once: the token is spent and a second setup answers 404 not_found', async () => {
    const h = await harness();
    await setUp(h);

    const again = await setUp(h, 'intruder');

    expect(again.statusCode).toBe(404);
    expect(again.json()).toEqual({ error: 'not_found' });
  });

  it('answers 404 token_invalid for a wrong token and 400 for a short password', async () => {
    const h = await harness();

    const wrong = await h.app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { token: 'nope', username: 'owner', password: PASSWORD },
    });
    const short = await h.app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { token: tokenOf(h.setupLink), username: 'owner', password: 'too short' },
    });

    expect(wrong.json()).toEqual({ error: 'token_invalid' });
    expect(wrong.statusCode).toBe(404);
    expect(short.statusCode).toBe(400);
  });

  it('rate-limits wrong setup tokens per address', async () => {
    const h = await harness();
    const wrong = () =>
      h.app.inject({
        method: 'POST',
        url: '/auth/setup',
        payload: { token: 'nope', username: 'owner', password: PASSWORD },
      });
    for (let i = 0; i < 30; i += 1) await wrong();

    const refused = await setUp(h);

    await setUp(h);

    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
    expect(events(h.db).filter((e) => e.kind === 'login_locked')).toHaveLength(1);
  });

  it('counts concurrent wrong sign-ins before the hash finishes', async () => {
    const db = openDatabase(':memory:');
    createAccount(db);
    const slow: Hasher = {
      hash: fakeHasher.hash,
      verify: async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return fakeHasher.verify(...args);
      },
    };
    const h = await harness({ db, hasher: slow });

    const codes = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.app.inject({
          method: 'POST',
          url: '/auth/session',
          payload: { username: 'owner', password: 'wrong password!' },
        }),
      ),
    );

    expect(codes.map((r) => r.statusCode).sort()).toEqual([
      ...Array(5).fill(401),
      ...Array(5).fill(429),
    ]);
  });

  it('behind the proxy, limits on the nearest hop, not a forged X-Forwarded-For', async () => {
    const h = await harness({ trustProxy: '127.0.0.1' });
    const signIn = (forged: string) =>
      h.app.inject({
        method: 'POST',
        url: '/auth/session',
        headers: { 'x-forwarded-for': `${forged}, 203.0.113.9` },
        payload: { username: 'owner', password: 'wrong password!' },
      });
    for (let i = 0; i < 5; i += 1) await signIn(`6.6.6.${i}`);

    expect((await signIn('7.7.7.7')).statusCode).toBe(429);
  });

  it('ignores X-Forwarded-For from a peer that is not the listed proxy', async () => {
    const h = await harness({ trustProxy: '172.18.0.2' });
    const signIn = (forged: string) =>
      h.app.inject({
        method: 'POST',
        url: '/auth/session',
        remoteAddress: '172.18.0.9',
        headers: { 'x-forwarded-for': forged },
        payload: { username: 'owner', password: 'wrong password!' },
      });
    for (let i = 0; i < 5; i += 1) await signIn(`6.6.6.${i}`);

    expect((await signIn('7.7.7.7')).statusCode).toBe(429);
  });

  it('prints no link once an account exists', async () => {
    const db = openDatabase(':memory:');
    createAccount(db);

    const h = await harness({ db });

    expect(h.setupLink).toBeNull();
  });
});

describe('sign-in and sign-out (UC13, UC14)', () => {
  it('signs in, sets last_login_at, and the cookie opens protected routes', async () => {
    const h = await harness();
    await setUp(h);

    const response = await signIn(h.app, 'OWNER', PASSWORD);
    const profiles = await h.app.inject({
      method: 'GET',
      url: '/profiles',
      headers: { cookie: cookieOf(response) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<User>()).toMatchObject({ username: 'owner', role: 'owner' });
    expect(response.body).not.toContain('fake:');
    expect(profiles.statusCode).toBe(200);
    expect(events(h.db).at(-1)).toMatchObject({ kind: 'login_ok', ip: '127.0.0.1' });
  });

  it('answers the same 401 for a wrong password and an unknown user (no enumeration)', async () => {
    const h = await harness();
    await setUp(h);

    const wrong = await signIn(h.app, 'owner', 'wrong password!');
    const unknown = await signIn(h.app, 'nobody', 'wrong password!');

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.body).toBe(unknown.body);
    expect(wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(events(h.db).slice(-2)).toMatchObject([
      { kind: 'login_failed', usernameTried: 'owner' },
      { kind: 'login_failed', usernameTried: null, userId: null },
    ]);
  });

  it.each(['my password typed here', 'correcthorsebatterystaple'])(
    'never records %j, which names no account and may be a password (spec auth R9)',
    async (typed) => {
      const h = await harness();
      await setUp(h);

      await signIn(h.app, typed, 'x');

      expect(events(h.db).at(-1)).toMatchObject({ kind: 'login_failed', usernameTried: null });
    },
  );

  it('locks a pair after 5 failures, for known and unknown usernames alike', async () => {
    const h = await harness();
    await setUp(h);
    for (let i = 0; i < 5; i += 1) {
      await signIn(h.app, 'owner', 'wrong password!');
      await signIn(h.app, 'ghost', 'wrong password!');
    }

    const known = await signIn(h.app, 'owner', PASSWORD);
    const unknown = await signIn(h.app, 'ghost', PASSWORD);
    await signIn(h.app, 'owner', PASSWORD);

    expect(known.statusCode).toBe(429);
    expect(known.json()).toEqual({ error: 'too_many_attempts' });
    expect(Number(known.headers['retry-after'])).toBeGreaterThan(0);
    expect(unknown.statusCode).toBe(429);
    expect(
      events(h.db)
        .filter((e) => e.kind === 'login_locked')
        .map((e) => e.usernameTried),
    ).toEqual(['owner', null]);
  });

  it('replaces a pre-set session at sign-in (no fixation)', async () => {
    const h = await harness();
    const first = cookieOf(await setUp(h));

    const second = cookieOf(await signIn(h.app, 'owner', PASSWORD, first));
    const old = await h.app.inject({ method: 'GET', url: '/profiles', headers: { cookie: first } });

    expect(second).not.toBe(first);
    expect(old.statusCode).toBe(401);
  });

  it('finds the session behind a shadowing cookie of the same name', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));

    const response = await h.app.inject({
      method: 'GET',
      url: '/auth/status',
      headers: { cookie: `pctv_session=shadowed-by-another-app; ${cookie}` },
    });

    expect(response.json<AuthStatus>().user?.username).toBe('owner');
  });

  it('signs out this device only, clearing the cookie', async () => {
    const h = await harness();
    const a = cookieOf(await setUp(h));
    const b = cookieOf(await signIn(h.app, 'owner', PASSWORD));

    const out = await h.app.inject({
      method: 'DELETE',
      url: '/auth/session',
      headers: { cookie: a },
    });

    expect(out.statusCode).toBe(204);
    expect(out.headers['set-cookie']).toContain('Max-Age=0');
    expect((await h.app.inject({ url: '/profiles', headers: { cookie: a } })).statusCode).toBe(401);
    expect((await h.app.inject({ url: '/profiles', headers: { cookie: b } })).statusCode).toBe(200);
  });

  it('signs out every device', async () => {
    const h = await harness();
    const a = cookieOf(await setUp(h));
    const b = cookieOf(await signIn(h.app, 'owner', PASSWORD));

    const out = await h.app.inject({
      method: 'DELETE',
      url: '/auth/sessions',
      headers: { cookie: a },
    });

    expect(out.statusCode).toBe(204);
    expect((await h.app.inject({ url: '/profiles', headers: { cookie: b } })).statusCode).toBe(401);
  });

  it('answers 429 when the hasher is saturated', async () => {
    const busy: Hasher = {
      hash: fakeHasher.hash,
      verify: async () => {
        throw new HasherBusyError();
      },
    };
    const h = await harness({ hasher: busy });

    const response = await signIn(h.app, 'owner', PASSWORD);

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: 'too_many_attempts' });
    expect(response.headers['retry-after']).toBe('2');
  });

  it('does not count busy answers against the account', async () => {
    const db = openDatabase(':memory:');
    createAccount(db);
    let saturated = true;
    const flaky: Hasher = {
      hash: fakeHasher.hash,
      verify: async (...args) => {
        if (saturated) throw new HasherBusyError();
        return fakeHasher.verify(...args);
      },
    };
    const h = await harness({ db, hasher: flaky });
    for (let i = 0; i < 6; i += 1) await signIn(h.app, 'owner', 'wrong password!');
    saturated = false;

    expect((await signIn(h.app, 'owner', 'wrong password!')).statusCode).toBe(401);
  });

  it('names the cookie __Host-pctv_session and marks it Secure on https', async () => {
    const h = await harness({ publicUrl: 'https://tv.example.org' });

    const response = await setUp(h);

    expect(response.headers['set-cookie']).toMatch(/^__Host-pctv_session=[\w-]{43}; .*; Secure$/);
  });
});

describe('password change (UC19)', () => {
  const change = (app: FastifyInstance, cookie: string, current: string, next: string) =>
    app.inject({
      method: 'PUT',
      url: '/auth/password',
      headers: { cookie },
      payload: { current, next },
    });

  it('rotates the current cookie, ends the other sessions, and takes the new password', async () => {
    const h = await harness();
    const mine = cookieOf(await setUp(h));
    const other = cookieOf(await signIn(h.app, 'owner', PASSWORD));

    const response = await change(h.app, mine, PASSWORD, 'a brand new password');
    const rotated = cookieOf(response);

    expect(response.statusCode).toBe(204);
    expect(rotated).not.toBe(mine);
    expect((await h.app.inject({ url: '/profiles', headers: { cookie: mine } })).statusCode).toBe(
      401,
    );
    expect((await h.app.inject({ url: '/profiles', headers: { cookie: other } })).statusCode).toBe(
      401,
    );
    expect(
      (await h.app.inject({ url: '/profiles', headers: { cookie: rotated } })).statusCode,
    ).toBe(200);
    expect((await signIn(h.app, 'owner', 'a brand new password')).statusCode).toBe(200);
    expect((await signIn(h.app, 'owner', PASSWORD)).statusCode).toBe(401);
  });

  it('revokes the pending reset link, which would hand the account back (UC19)', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));
    const owner = h.db.select().from(users).get();
    if (!owner) throw new Error('no owner');
    const tokens = new TokenRepository(h.db);
    const reset = tokens.issueReset(owner.id, new Date());
    const other = tokens.issueReset(createAccount(h.db, 'kid', 'viewer').userId, new Date());

    await change(h.app, cookie, PASSWORD, 'a brand new password');
    const redeemed = await h.app.inject({
      method: 'POST',
      url: '/auth/redeem',
      payload: { kind: 'reset', token: reset.token, password: 'an attacker password' },
    });

    expect(redeemed.statusCode).toBe(404);
    expect(tokens.isPending(other.token, 'reset', new Date())).toBe(true);
  });

  it('answers 401 invalid_credentials for a wrong current password, 400 for a weak new one', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));

    const wrong = await change(h.app, cookie, 'wrong password!', 'a brand new password');
    const weak = await change(h.app, cookie, PASSWORD, 'short');

    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(weak.statusCode).toBe(400);
  });

  it('rate-limits wrong current passwords', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));
    for (let i = 0; i < 5; i += 1)
      await change(h.app, cookie, 'wrong password!', 'a brand new password');

    const refused = await change(h.app, cookie, PASSWORD, 'a brand new password');
    await change(h.app, cookie, PASSWORD, 'a brand new password');

    expect(refused.statusCode).toBe(429);
    expect(events(h.db).filter((e) => e.kind === 'login_locked')).toMatchObject([
      { userId: expect.any(String) },
    ]);
  });

  it('refunds an attempt the busy hasher never judged', async () => {
    let saturated = true;
    const flaky: Hasher = {
      hash: fakeHasher.hash,
      verify: async (...args) => {
        if (saturated) throw new HasherBusyError();
        return fakeHasher.verify(...args);
      },
    };
    const h = await harness({ hasher: flaky });
    const cookie = cookieOf(await setUp(h));
    for (let i = 0; i < 6; i += 1) {
      expect(
        (await change(h.app, cookie, 'wrong password!', 'a brand new password')).statusCode,
      ).toBe(429);
    }
    saturated = false;

    expect((await change(h.app, cookie, PASSWORD, 'a brand new password')).statusCode).toBe(204);
  });

  it('accepts a password that is the NFD spelling of the NFC one', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));
    await change(h.app, cookie, PASSWORD, 'café café café');

    const nfd = await signIn(h.app, 'owner', 'café café café');

    expect(nfd.statusCode).toBe(200);
  });
});

describe('access control (spec auth R1, R2, R7)', () => {
  it('answers 401 before 404 for an unknown URL without a session', async () => {
    const h = await harness();
    const cookie = cookieOf(await setUp(h));

    const anonymous = await h.app.inject({ method: 'GET', url: '/no-such-route' });
    const signedIn = await h.app.inject({
      method: 'GET',
      url: '/no-such-route',
      headers: { cookie },
    });

    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: 'unauthenticated' });
    expect(signedIn.statusCode).toBe(404);
  });

  it('answers 403 forbidden to a viewer on owner routes, 200 elsewhere', async () => {
    const db = openDatabase(':memory:');
    createAccount(db);
    const viewer = createAccount(db, 'kid', 'viewer');
    const h = await harness({ db });
    const headers = { cookie: viewer.cookie };

    const create = await h.app.inject({
      method: 'POST',
      url: '/libraries',
      headers,
      payload: { name: 'X', rootPath: tmpdir(), kind: 'films' },
    });
    const list = await h.app.inject({ method: 'GET', url: '/libraries', headers });

    expect(create.statusCode).toBe(403);
    expect(create.json()).toEqual({ error: 'forbidden' });
    expect(list.statusCode).toBe(200);
  });

  it.each([
    ['GET', '/libraries/folders'],
    ['PATCH', '/libraries/00000000-0000-4000-8000-000000000000'],
    ['DELETE', '/libraries/00000000-0000-4000-8000-000000000000'],
  ] as const)('answers 403 forbidden to a viewer on %s %s', async (method, url) => {
    const db = openDatabase(':memory:');
    createAccount(db);
    const viewer = createAccount(db, 'kid', 'viewer');
    const h = await harness({ db });

    const response = await h.app.inject({
      method,
      url,
      headers: { cookie: viewer.cookie },
      payload: method === 'PATCH' ? { name: 'X' } : undefined,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'forbidden' });
  });

  it('applies a role change on the next request', async () => {
    const db = openDatabase(':memory:');
    createAccount(db);
    const viewer = createAccount(db, 'kid', 'viewer');
    const h = await harness({ db });
    db.update(users).set({ role: 'owner' }).where(eq(users.username, 'kid')).run();

    const scan = await h.app.inject({
      method: 'POST',
      url: '/libraries/00000000-0000-4000-8000-000000000000/scan',
      headers: { cookie: viewer.cookie },
    });

    expect(scan.statusCode).toBe(404);
  });

  it.each([[{ 'sec-fetch-site': 'cross-site' }], [{ origin: 'https://evil.example' }]])(
    'refuses an unsafe request %j with 403 csrf, even a public one',
    async (headers) => {
      const h = await harness();

      const response = await h.app.inject({
        method: 'POST',
        url: '/auth/session',
        headers,
        payload: { username: 'owner', password: PASSWORD },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'csrf' });
    },
  );

  it('accepts an unsafe request from the public origin', async () => {
    const h = await harness();

    const response = await h.app.inject({
      method: 'POST',
      url: '/auth/session',
      headers: { origin: TEST_PUBLIC_URL, 'sec-fetch-site': 'same-origin' },
      payload: { username: 'owner', password: PASSWORD },
    });

    expect(response.statusCode).toBe(401);
  });
});

/** Every `METHOD path` of the route tree `printRoutes({ commonPrefix: false })` draws. */
function routeTable(app: FastifyInstance): Array<{ method: string; url: string }> {
  const routes: Array<{ method: string; url: string }> = [];
  const stack: string[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match = /^((?:│ {3}| {4})*)[├└]── (\S+)(?: \(([^)]+)\))?$/.exec(line);
    if (!match) continue;
    const depth = (match[1] ?? '').length / 4;
    stack.length = depth;
    stack.push(match[2] ?? '');
    for (const method of (match[3] ?? '').split(', ').filter(Boolean)) {
      routes.push({ method, url: stack.join('') });
    }
  }
  return routes;
}

describe('route table', () => {
  const PUBLIC = new Set([
    'GET /health',
    'HEAD /health',
    'GET /auth/status',
    'HEAD /auth/status',
    'POST /auth/setup',
    'POST /auth/redeem',
    'POST /auth/session',
  ]);

  it('answers 401 on every non-public route without a session', async () => {
    const h = await harness();
    const routes = routeTable(h.app);
    expect(routes).toContainEqual({ method: 'DELETE', url: '/auth/sessions' });
    expect(routes).toContainEqual({
      method: 'PUT',
      url: '/profiles/:profileId/media/:id/progress',
    });

    const protectedRoutes = routes.filter(({ method, url }) => !PUBLIC.has(`${method} ${url}`));
    const statuses = await Promise.all(
      protectedRoutes.map(async ({ method, url }) => {
        const concrete = url.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000');
        const response = await h.app.inject({
          method: method as 'GET',
          url: concrete,
          payload: method === 'GET' || method === 'HEAD' ? undefined : {},
        });
        return `${method} ${url} ${response.statusCode}`;
      }),
    );

    expect(protectedRoutes.length).toBeGreaterThan(15);
    expect(statuses).toEqual(protectedRoutes.map(({ method, url }) => `${method} ${url} 401`));
  });

  it('declares exactly the spec public routes as public', async () => {
    const h = await harness();
    createAccount(h.db);

    const open = await Promise.all(
      routeTable(h.app).map(async ({ method, url }) => {
        const response = await h.app.inject({
          method: method as 'GET',
          url: url.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000'),
          payload: method === 'GET' || method === 'HEAD' ? undefined : {},
        });
        return response.statusCode === 401 ? null : `${method} ${url}`;
      }),
    );

    expect(open.filter((r) => r !== null).sort()).toEqual([...PUBLIC].sort());
  });
});
