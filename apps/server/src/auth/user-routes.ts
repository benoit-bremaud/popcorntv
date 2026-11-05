import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ROLES } from '@popcorntv/shared';
import type { IssuedLink } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { apiError, callerOf, invalid } from '../http.js';
import type { EventRepository } from './event-repository.js';
import type { SessionRepository } from './session-repository.js';
import type { IssuedToken, TokenRepository } from './token-repository.js';
import type { UserRepository } from './user-repository.js';

const userParams = z.object({ id: z.uuid() });
const sessionParams = z.object({ id: z.uuid(), sessionId: z.uuid() });
const roleBody = z.object({ role: z.enum(ROLES) });

/** What the owner administration routes need; built by `buildApp`. */
export interface UserRoutesDeps {
  readonly db: AppDatabase;
  readonly users: UserRepository;
  readonly sessions: SessionRepository;
  readonly tokens: TokenRepository;
  readonly events: EventRepository;
  /** `PUBLIC_URL`'s origin: links put the token in the fragment (spec auth §4.2). */
  readonly origin: string;
}

const OWNER = { config: { access: 'owner' } } as const;

/**
 * UC15–UC18 (spec auth §4.2): invitations, reset links, account administration and the
 * event list. Every route is owner-only. An event's `userId` is the account acted on; for
 * invitations and deletions, which leave none, it is the acting owner (spec auth R9).
 */
export function registerUserRoutes(app: FastifyInstance, deps: UserRoutesDeps): void {
  const { users, sessions, tokens, events } = deps;

  const link = (path: 'invite' | 'reset', issued: IssuedToken): IssuedLink => ({
    link: `${deps.origin}/#/${path}/${issued.token}`,
    expiresAt: issued.expiresAt,
  });
  const notFound = (reply: FastifyReply) => reply.code(404).send(apiError('not_found'));

  app.get('/users', OWNER, (_request, reply) => {
    return reply.send(users.list(sessions.liveCounts(new Date())));
  });

  app.patch('/users/:id', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    const body = roleBody.safeParse(request.body);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const { id } = params.data;
    const now = new Date();
    // A role change revokes the pending reset link (UC17).
    const result = deps.db.transaction(() => {
      const outcome = users.setRole(id, body.data.role);
      if (outcome === 'ok') tokens.revokeResets(id, now);
      return outcome;
    });
    if (result === 'not_found') return notFound(reply);
    if (result === 'last_owner') return reply.code(409).send(apiError('last_owner'));
    events.record('role_changed', { userId: id, ip: request.ip }, now);
    return reply.send(users.find(id));
  });

  app.delete('/users/:id', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const actor = callerOf(request).userId;
    // The cascade removes the account's sessions, profiles and reset links.
    const result = deps.db.transaction(() => users.delete(params.data.id));
    if (result === 'not_found') return notFound(reply);
    if (result === 'last_owner') return reply.code(409).send(apiError('last_owner'));
    // The deleted row cannot be referenced: name the acting owner, unless they deleted themselves.
    const userId = actor === params.data.id ? null : actor;
    events.record('user_deleted', { userId, ip: request.ip });
    return reply.code(204).send();
  });

  app.get('/users/:id/sessions', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!users.exists(params.data.id)) return notFound(reply);
    return reply.send(sessions.listLive(params.data.id, new Date()));
  });

  app.delete('/users/:id/sessions', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!users.exists(params.data.id)) return notFound(reply);
    sessions.revokeAll(params.data.id, new Date());
    events.record('sessions_ended', { userId: params.data.id, ip: request.ip });
    return reply.code(204).send();
  });

  app.delete('/users/:id/sessions/:sessionId', OWNER, (request, reply) => {
    const params = sessionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const { id, sessionId } = params.data;
    if (!sessions.revokeOf(id, sessionId, new Date())) {
      return reply.code(404).send(apiError('session_not_found'));
    }
    events.record('sessions_ended', { userId: id, ip: request.ip });
    return reply.code(204).send();
  });

  app.post('/users/:id/reset', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!users.exists(params.data.id)) return notFound(reply);
    const now = new Date();
    const issued = deps.db.transaction(() => tokens.issueReset(params.data.id, now));
    events.record('reset_issued', { userId: params.data.id, ip: request.ip }, now);
    return reply.code(201).send(link('reset', issued));
  });

  app.delete('/users/:id/reset', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!tokens.revokeResets(params.data.id, new Date())) return notFound(reply);
    events.record('reset_revoked', { userId: params.data.id, ip: request.ip });
    return reply.code(204).send();
  });

  app.post('/invitations', OWNER, (request, reply) => {
    const body = roleBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const now = new Date();
    const issued = tokens.issueInvite(body.data.role, now);
    events.record('invite_issued', { userId: callerOf(request).userId, ip: request.ip }, now);
    return reply.code(201).send(link('invite', issued));
  });

  app.get('/invitations', OWNER, (_request, reply) =>
    reply.send(tokens.pendingInvites(new Date())),
  );

  app.delete('/invitations/:id', OWNER, (request, reply) => {
    const params = userParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!tokens.revokeInvite(params.data.id, new Date())) return notFound(reply);
    events.record('invite_revoked', { userId: callerOf(request).userId, ip: request.ip });
    return reply.code(204).send();
  });

  app.get('/auth/events', OWNER, (_request, reply) => reply.send(events.list()));
}
