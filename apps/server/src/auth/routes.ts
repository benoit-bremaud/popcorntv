import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PASSWORD_MAX, PASSWORD_MIN, USERNAME_PATTERN } from '@popcorntv/shared';
import type { AuthStatus, User } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { apiError, callerOf, invalid } from '../http.js';
import type { ProfileRepository } from '../profiles/repository.js';
import type { EventRepository } from './event-repository.js';
import type { Hasher } from './hasher.js';
import { sessionCookie } from './hook.js';
import type { CookiePolicy } from './hook.js';
import type { LoginLimiter } from './limiter.js';
import type { SessionRepository } from './session-repository.js';
import type { SetupToken } from './setup-token.js';
import type { UserRepository } from './user-repository.js';
import { usernameKey } from './user-repository.js';

/** A new password (spec auth R4): NFC, 12–128 characters, no composition rule, no truncation. */
export const newPassword = z
  .string()
  .transform((value) => value.normalize('NFC'))
  .refine((value) => {
    const length = [...value].length;
    return length >= PASSWORD_MIN && length <= PASSWORD_MAX;
  }, `between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`);
/** A submitted password: bounded so a huge body never reaches the hasher, never length-checked. */
const submittedPassword = z
  .string()
  .max(PASSWORD_MAX * 4)
  .transform((value) => value.normalize('NFC'));
export const username = z.string().regex(USERNAME_PATTERN);

const setupBody = z.object({ token: z.string().max(128), username, password: newPassword });
const signInBody = z.object({ username: z.string().max(64), password: submittedPassword });
const passwordBody = z.object({ current: submittedPassword, next: newPassword });

/** What the auth routes need; built by `buildApp`. */
export interface AuthRoutesDeps {
  readonly db: AppDatabase;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly events: EventRepository;
  readonly hasher: Hasher;
  readonly limiter: LoginLimiter;
  readonly setupToken: SetupToken;
  readonly profiles: Pick<ProfileRepository, 'adoptOrphans' | 'createFirst'>;
  readonly cookie: CookiePolicy;
}

const PUBLIC = { config: { access: 'public' } } as const;

/**
 * UC11, UC13, UC14, UC19 (spec auth §4.2): status, first-owner setup, sign-in / out and
 * password change. Every route running the hasher is rate-limited (spec auth R8).
 */
export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  const { users, sessions, events, limiter } = deps;

  /**
   * Starts a session for `user`, ending the one the request carried (no session fixation),
   * and returns the cookie value; set it only once every write has succeeded.
   */
  const signIn = (request: FastifyRequest, user: User, now: Date): string => {
    if (request.caller) sessions.revoke(request.caller.sessionId, now);
    const issued = sessions.create(user.id, request.headers['user-agent'], now);
    users.touchLogin(user.id, now);
    return sessionCookie(deps.cookie, issued.token);
  };

  const tooMany = (reply: FastifyReply, retryAfterSec: number) =>
    reply
      .code(429)
      .header('retry-after', String(retryAfterSec))
      .send(apiError('too_many_attempts'));

  app.get('/auth/status', PUBLIC, (request, reply) => {
    const status: AuthStatus = { setupRequired: users.isEmpty() };
    const user = request.caller ? users.find(request.caller.userId) : undefined;
    return reply.send(user ? { ...status, user } : status);
  });

  app.post('/auth/setup', PUBLIC, async (request, reply) => {
    const body = setupBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    if (!users.isEmpty()) return reply.code(404).send(apiError('not_found'));
    const limit = limiter.check(request.ip, null);
    if (!limit.allowed) return tooMany(reply, limit.retryAfterSec);
    if (!deps.setupToken.matches(body.data.token)) {
      limiter.fail(request.ip, null);
      return reply.code(404).send(apiError('token_invalid'));
    }
    // better-sqlite3 transactions are synchronous: hash before opening one (spec auth §4.1).
    const passwordHash = await deps.hasher.hash(body.data.password);
    const now = new Date();
    // Repositories share the connection, so their statements run inside this transaction.
    const done = deps.db.transaction(() => {
      if (!users.isEmpty()) return null;
      const user = users.create(body.data.username, passwordHash, 'owner', now);
      deps.profiles.adoptOrphans(user.id);
      deps.profiles.createFirst(user.id, user.username, now);
      return { user, cookie: signIn(request, user, now) };
    });
    if (done === null) return reply.code(404).send(apiError('not_found'));
    deps.setupToken.clear();
    events.record('setup_done', { userId: done.user.id, ip: request.ip }, now);
    return reply.code(201).header('set-cookie', done.cookie).send(done.user);
  });

  app.post('/auth/session', PUBLIC, async (request, reply) => {
    const body = signInBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const key = usernameKey(body.data.username);
    const limit = limiter.check(request.ip, key);
    if (!limit.allowed) {
      if (limit.firstRefusal) {
        events.record('login_locked', { ip: request.ip, usernameTried: body.data.username });
      }
      return tooMany(reply, limit.retryAfterSec);
    }
    const stored = users.findByUsername(body.data.username);
    const ok = await deps.hasher.verify(stored?.passwordHash ?? null, body.data.password);
    if (!stored || !ok) {
      limiter.fail(request.ip, key);
      events.record('login_failed', {
        userId: stored?.id ?? null,
        ip: request.ip,
        usernameTried: body.data.username,
      });
      return reply.code(401).send(apiError('invalid_credentials'));
    }
    limiter.succeed(request.ip, key);
    const now = new Date();
    const user: User = { id: stored.id, username: stored.username, role: stored.role };
    const cookie = signIn(request, user, now);
    events.record('login_ok', { userId: user.id, ip: request.ip }, now);
    sessions.purge(now);
    events.purge(now);
    return reply.header('set-cookie', cookie).send(user);
  });

  app.delete('/auth/session', (request, reply) => {
    const caller = callerOf(request);
    sessions.revoke(caller.sessionId, new Date());
    events.record('logout', { userId: caller.userId, ip: request.ip });
    return reply.code(204).header('set-cookie', sessionCookie(deps.cookie, null)).send();
  });

  app.delete('/auth/sessions', (request, reply) => {
    const caller = callerOf(request);
    sessions.revokeAll(caller.userId, new Date());
    events.record('logout', { userId: caller.userId, ip: request.ip });
    return reply.code(204).header('set-cookie', sessionCookie(deps.cookie, null)).send();
  });

  app.put('/auth/password', async (request, reply) => {
    const caller = callerOf(request);
    const body = passwordBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const stored = users.findStored(caller.userId);
    if (!stored) return reply.code(401).send(apiError('unauthenticated'));
    const key = usernameKey(stored.username);
    const limit = limiter.check(request.ip, key);
    if (!limit.allowed) return tooMany(reply, limit.retryAfterSec);
    if (!(await deps.hasher.verify(stored.passwordHash, body.data.current))) {
      limiter.fail(request.ip, key);
      return reply.code(401).send(apiError('invalid_credentials'));
    }
    limiter.succeed(request.ip, key);
    const passwordHash = await deps.hasher.hash(body.data.next);
    const now = new Date();
    const token = deps.db.transaction(() => {
      users.setPassword(caller.userId, passwordHash);
      sessions.revokeAll(caller.userId, now, caller.sessionId);
      return sessions.rotate(caller.sessionId);
    });
    events.record('password_changed', { userId: caller.userId, ip: request.ip }, now);
    return reply.code(204).header('set-cookie', sessionCookie(deps.cookie, token)).send();
  });
}
