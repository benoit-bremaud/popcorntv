import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { apiError } from '../http.js';
import type { SessionRepository } from './session-repository.js';
import { ABSOLUTE_MS } from './session-repository.js';

/** Methods that never change state (spec auth R7): exempt from the CSRF check. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Cookie name and flags derived from `PUBLIC_URL` (spec auth R5, R6). */
export interface CookiePolicy {
  readonly name: string;
  readonly secure: boolean;
  /** `PUBLIC_URL`'s origin, the only one allowed to send unsafe requests (spec auth R7). */
  readonly origin: string;
}

/** `__Host-pctv_session` + `Secure` on https, `pctv_session` on http (dev). */
export function cookiePolicy(publicUrl: string): CookiePolicy {
  const url = new URL(publicUrl);
  const secure = url.protocol === 'https:';
  return { name: secure ? '__Host-pctv_session' : 'pctv_session', secure, origin: url.origin };
}

/** The `Set-Cookie` value carrying a session token, or clearing it when `token` is null. */
export function sessionCookie(policy: CookiePolicy, token: string | null): string {
  const maxAge = token === null ? 0 : Math.floor(ABSOLUTE_MS / 1000);
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (policy.secure) flags.push('Secure');
  return [`${policy.name}=${token ?? ''}`, ...flags].join('; ');
}

/**
 * Every non-empty value of cookie `name` in a `Cookie` header, in order. On http another
 * app on the same host can set a cookie of the same name, so the hook tries each one.
 */
export function readCookies(header: string | undefined, name: string): string[] {
  if (header === undefined) return [];
  const values: string[] = [];
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      if (value !== '') values.push(value);
    }
  }
  return values;
}

/**
 * True when an unsafe request must be refused (spec auth R7): `Sec-Fetch-Site:
 * cross-site`, or an `Origin` header that differs from the public origin.
 */
export function isCrossSite(
  method: string,
  headers: { readonly origin?: string; readonly 'sec-fetch-site'?: string | string[] },
  origin: string,
): boolean {
  if (SAFE_METHODS.has(method)) return false;
  if (headers['sec-fetch-site'] === 'cross-site') return true;
  return headers.origin !== undefined && headers.origin !== origin;
}

export interface AuthHookDeps {
  readonly sessions: Pick<SessionRepository, 'resolve'>;
  readonly cookie: CookiePolicy;
}

/**
 * The single access gate (spec auth R1, ADR-0010): CSRF first, then the session cookie,
 * then the matched route's `config.access`. A URL matching no route answers 401 without a
 * session, so the route map cannot be probed.
 */
export function registerAuthHook(app: FastifyInstance, deps: AuthHookDeps): void {
  app.decorateRequest('caller', null);

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isCrossSite(request.method, request.headers, deps.cookie.origin)) {
      return reply.code(403).send(apiError('csrf'));
    }
    const now = new Date();
    let session = null;
    // Bounded: a header is at most a few kB, and each try is one indexed lookup.
    for (const token of readCookies(request.headers.cookie, deps.cookie.name).slice(0, 4)) {
      session = deps.sessions.resolve(token, now);
      if (session) break;
    }
    request.caller = session && {
      userId: session.userId,
      role: session.role,
      sessionId: session.sessionId,
    };
    // `routeOptions.url` is undefined when no route matched (the 404 handler runs).
    const matched = request.routeOptions.url !== undefined;
    const access = request.routeOptions.config.access;
    if (matched && access === 'public') return;
    if (request.caller === null) return reply.code(401).send(apiError('unauthenticated'));
    if (access === 'owner' && request.caller.role !== 'owner') {
      return reply.code(403).send(apiError('forbidden'));
    }
  });
}
