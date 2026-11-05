import type { FastifyInstance, InjectOptions } from 'fastify';
import type { Role } from '@popcorntv/shared';
import type { Hasher } from './auth/hasher.js';
import { SessionRepository } from './auth/session-repository.js';
import { UserRepository } from './auth/user-repository.js';
import type { AppDatabase } from './db/index.js';
import type { Caller } from './http.js';
import { ProfileRepository } from './profiles/repository.js';

/** Test helpers shared by the route suites (excluded from the build and from coverage). */

export const TEST_PUBLIC_URL = 'http://localhost:5173';

/** Instant, deterministic stand-in for argon2id: the routes' logic, not the KDF, is under test. */
export const fakeHasher: Hasher = {
  hash: async (password) => `fake:${password}`,
  verify: async (stored, password) => stored !== null && stored === `fake:${password}`,
};

/** Options every `buildApp` suite shares: the auth settings without real hashing or logs. */
export const testAuthOptions = {
  publicUrl: TEST_PUBLIC_URL,
  hasher: fakeHasher,
  onSetupLink: () => undefined,
} as const;

/** A signed-in account created straight in the database. */
export interface TestAccount {
  readonly userId: string;
  readonly sessionId: string;
  /** `Cookie` header value carrying the session. */
  readonly cookie: string;
}

/**
 * Creates an account (password `<username>-password!`) and a session. The first account
 * adopts the orphan `default` profile, like the first-owner setup.
 */
export function createAccount(
  db: AppDatabase,
  username = 'owner',
  role: Role = 'owner',
): TestAccount {
  const users = new UserRepository(db);
  const profiles = new ProfileRepository(db);
  const now = new Date();
  const user = users.create(username, `fake:${username}-password!`, role, now);
  profiles.adoptOrphans(user.id);
  profiles.createFirst(user.id, username, now);
  const session = new SessionRepository(db).create(user.id, 'vitest', now);
  return { userId: user.id, sessionId: session.id, cookie: `pctv_session=${session.token}` };
}

/** Makes every later `app.inject` carry `cookie` unless the call sets its own. */
export function sendCookie(app: FastifyInstance, cookie: string): void {
  const inject = app.inject.bind(app);
  const withCookie = async (options: InjectOptions) =>
    inject({ ...options, headers: { cookie, ...options.headers } });
  Object.assign(app, { inject: withCookie });
}

/** For suites that register routes on a bare Fastify: stands in for the auth hook. */
export function actAs(app: FastifyInstance, caller: () => Caller): void {
  app.addHook('onRequest', async (request) => {
    request.caller = caller();
  });
}
