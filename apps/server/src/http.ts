import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiError, ApiErrorCode, Library, Role } from '@popcorntv/shared';
import type { LibraryRepository } from './library/repository.js';

/** Helpers shared by every route module: the caller, library lookup and error bodies. */

/**
 * Who sent the request, set by the auth hook from the session cookie (spec auth §4.5).
 * Lives here so `profiles`, `progress` and `playback` never import `auth`.
 */
export interface Caller {
  readonly userId: string;
  readonly role: Role;
  /** The session the cookie resolved to: sign-out and password change end or rotate it. */
  readonly sessionId: string;
}

/**
 * Route options of the media routes the global rate limit skips (spec auth R13): a player
 * fetches segments, ranges, artwork and heartbeats in bursts, and every one of them is
 * already behind the session check.
 */
export const MEDIA_ROUTE = { config: { rateLimit: false } } as const;

/** Route access (spec auth R1): `public`, `owner`, or absent for any signed-in user. */
export type RouteAccess = 'public' | 'owner';

declare module 'fastify' {
  interface FastifyRequest {
    /** Null on a public route without a valid session; set on every other route. */
    caller: Caller | null;
  }
  interface FastifyContextConfig {
    readonly access?: RouteAccess;
  }
}

/**
 * The caller of a protected route. The hook has already answered 401 without one, so a
 * missing caller is a wiring bug (a route registered without the hook): fail loudly.
 */
export function callerOf(request: FastifyRequest): Caller {
  if (!request.caller) throw new Error('protected route reached without a caller');
  return request.caller;
}

const libraryParams = z.object({ id: z.uuid() });

/** Result of resolving `:id` to a library, or the error response to send. */
export type LoadedLibrary =
  | { readonly ok: true; readonly value: Library }
  | { readonly ok: false; readonly status: 400 | 404; readonly body: ApiError };

/** Validates the `:id` param (400 `invalid_request`) and loads the library (404 `library_not_found`). */
export function loadLibrary(params: unknown, repository: LibraryRepository): LoadedLibrary {
  const parsed = libraryParams.safeParse(params);
  if (!parsed.success) return { ok: false, status: 400, body: invalid(parsed.error.issues) };
  const library = repository.findLibrary(parsed.data.id);
  if (!library) return { ok: false, status: 404, body: apiError('library_not_found') };
  return { ok: true, value: library };
}

/** Only the path and message of each zod issue: enough for a client, nothing internal. */
export function invalid(issues: readonly z.core.$ZodIssue[]): ApiError {
  return {
    error: 'invalid_request',
    details: issues.map(({ path, message }) => ({ path, message })),
  };
}

/** A bare error body for a stable code. */
export function apiError(error: ApiErrorCode): ApiError {
  return { error };
}
