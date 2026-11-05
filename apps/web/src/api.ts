import type {
  ApiError,
  ApiErrorCode,
  AuthStatus,
  ChangePasswordBody,
  CreateProfileBody,
  Library,
  Media,
  PlaybackSessionBody,
  PlaybackStart,
  Profile,
  ProgressBody,
  SetupBody,
  SignInBody,
  UpdateProfileBody,
  User,
  WatchProgress,
} from '@popcorntv/shared';

/** Prefix the dev server (and the production reverse proxy) forwards to the API. */
const API = '/api';

/** A non-2xx answer or a network failure while loading the catalog. */
export class ApiRequestError extends Error {
  constructor(
    readonly path: string,
    readonly status: number | null,
  ) {
    const reason = status === null ? '' : ` with ${status}`;
    super(`Request to ${path} failed${reason}`);
    this.name = 'ApiRequestError';
  }
}

type Fetch = typeof fetch;

/** Called on any `401`: the session ended (expired, signed out elsewhere, revoked). */
let unauthenticated: () => void = () => undefined;

/** Registers what to do when the session is gone; the auth gate shows the sign-in form. */
export function onUnauthenticated(listener: () => void): void {
  unauthenticated = listener;
}

/** Passes the response through, telling the auth gate first when it is a `401`. */
function watched(response: Response): Response {
  if (response.status === 401) unauthenticated();
  return response;
}

/** GET a JSON array; anything else (error status, network failure, other shape) throws. */
async function getList<T>(fetchFn: Fetch, path: string): Promise<T[]> {
  let response: Response;
  try {
    response = watched(await fetchFn(`${API}${path}`));
  } catch {
    throw new ApiRequestError(path, null);
  }
  if (!response.ok) throw new ApiRequestError(path, response.status);
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new ApiRequestError(path, response.status);
  return body as T[];
}

/** Every media of every library (sequence diagram 02); `fetchFn` is injected for tests. */
export async function loadCatalog(fetchFn: Fetch = fetch): Promise<Media[]> {
  const libraries = await getList<Library>(fetchFn, '/libraries');
  const perLibrary = await Promise.all(
    libraries.map((library) =>
      getList<Media>(fetchFn, `/libraries/${encodeURIComponent(library.id)}/media`),
    ),
  );
  return perLibrary.flat();
}

/** URL of a cached artwork file served by `GET /artwork/:file`. */
export function artworkUrl(file: string): string {
  return `${API}/artwork/${encodeURIComponent(file)}`;
}

/**
 * URL of a WebVTT track served by `GET /media/:id/subtitles/:index`, its cues shifted by the
 * player's `offsetSec` (ADR-0009 §3).
 */
export function subtitleUrl(mediaId: string, index: number, offsetSec: number): string {
  return `${API}/media/${encodeURIComponent(mediaId)}/subtitles/${index}?offsetSec=${offsetSec}`;
}

/** Why a playback could not start: another title holds the transcoder, or anything else. */
export type PlaybackStartError = 'busy' | 'failed';

/**
 * `POST /playback/sessions` (spec hls-transcode §2.1): the server confirms direct play or
 * starts an HLS session. URLs come back relative to the API and are prefixed here.
 */
export async function startPlayback(
  body: PlaybackSessionBody,
  fetchFn: Fetch = fetch,
): Promise<PlaybackStart | PlaybackStartError> {
  try {
    const response = watched(
      await fetchFn(`${API}/playback/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
    if (response.status === 503) return 'busy';
    if (!response.ok) return 'failed';
    const start = (await response.json()) as PlaybackStart;
    return { ...start, url: `${API}${start.url}` };
  } catch {
    // Network failure, or a body that is not JSON (a proxy error page).
    return 'failed';
  }
}

/** Keeps a paused HLS session alive (ADR-0006 §4); a lost heartbeat is harmless. */
export async function sendHeartbeat(sessionId: string, fetchFn: Fetch = fetch): Promise<void> {
  try {
    watched(
      await fetchFn(`${API}/playback/sessions/${encodeURIComponent(sessionId)}/heartbeat`, {
        method: 'POST',
      }),
    );
  } catch {
    // The idle watchdog is the safety net.
  }
}

/** Ends an HLS session; `keepalive` lets it leave even while the page unloads. */
export async function stopPlayback(sessionId: string, fetchFn: Fetch = fetch): Promise<void> {
  try {
    await fetchFn(`${API}/playback/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      keepalive: true,
    });
  } catch {
    // The idle watchdog is the safety net.
  }
}

/** `/profiles/:profileId` prefix of every per-profile route (ADR-0008 §1). */
function profilePath(profileId: string): string {
  return `/profiles/${encodeURIComponent(profileId)}`;
}

/**
 * `PUT /profiles/:profileId/media/:id/progress` (spec resume-playback §2.2); `keepalive`
 * lets the last save leave while the player closes. A lost save is harmless: the next one
 * is newer.
 */
export async function saveProgress(
  profileId: string,
  mediaId: string,
  positionSec: number,
  fetchFn: Fetch = fetch,
): Promise<void> {
  try {
    watched(
      await fetchFn(
        `${API}${profilePath(profileId)}/media/${encodeURIComponent(mediaId)}/progress`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positionSec } satisfies ProgressBody),
          keepalive: true,
        },
      ),
    );
  } catch {
    // Ignored on purpose (spec 6a).
  }
}

/** `GET /profiles/:profileId/progress`; an unreachable server means "nothing to resume". */
export async function loadProgress(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<WatchProgress[]> {
  try {
    return await getList<WatchProgress>(fetchFn, `${profilePath(profileId)}/progress`);
  } catch {
    return [];
  }
}

/** `GET /profiles` (UC8); throws `ApiRequestError` like the catalog load. */
export async function loadProfiles(fetchFn: Fetch = fetch): Promise<Profile[]> {
  return getList<Profile>(fetchFn, '/profiles');
}

/** A profile write's answer: the stored profile, or the server's error code (null offline). */
/** A refused profile write: the server's error code, null when offline or unreadable. */
export type ProfileFailure = { readonly ok: false; readonly error: ApiErrorCode | null };

export type ProfileResult = { readonly ok: true; readonly profile: Profile } | ProfileFailure;

/** Sends one profile write and reads its JSON answer (UC9). */
async function writeProfile(
  fetchFn: Fetch,
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: CreateProfileBody | UpdateProfileBody,
): Promise<Response | null> {
  try {
    return watched(
      await fetchFn(`${API}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      }),
    );
  } catch {
    return null;
  }
}

async function profileResult(response: Response | null): Promise<ProfileResult> {
  if (response === null) return { ok: false, error: null };
  try {
    // First-party server contract: a 2xx carries a `Profile`, an error an `ApiError`.
    const body: unknown = await response.json();
    if (response.ok) return { ok: true, profile: body as Profile };
    const error = (body as Partial<ApiError> | null)?.error;
    return { ok: false, error: typeof error === 'string' ? error : null };
  } catch {
    return { ok: false, error: null };
  }
}

/** `POST /profiles`. */
export async function createProfile(
  body: CreateProfileBody,
  fetchFn: Fetch = fetch,
): Promise<ProfileResult> {
  return profileResult(await writeProfile(fetchFn, '/profiles', 'POST', body));
}

/** `PATCH /profiles/:profileId`. */
export async function updateProfile(
  profileId: string,
  body: UpdateProfileBody,
  fetchFn: Fetch = fetch,
): Promise<ProfileResult> {
  return profileResult(await writeProfile(fetchFn, profilePath(profileId), 'PATCH', body));
}

/** `DELETE /profiles/:profileId`: ok, or the error code (null when offline). */
export async function deleteProfile(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<{ readonly ok: true } | ProfileFailure> {
  const response = await writeProfile(fetchFn, profilePath(profileId), 'DELETE');
  if (response?.ok === true) return { ok: true };
  const result = await profileResult(response);
  // A non-2xx answer never parses as ok; keep the type honest without a cast.
  return result.ok ? { ok: false, error: null } : result;
}

/** `GET /auth/status` (spec auth §4.2); throws `ApiRequestError` when the server is unreachable. */
export async function loadAuthStatus(fetchFn: Fetch = fetch): Promise<AuthStatus> {
  let response: Response;
  try {
    response = await fetchFn(`${API}/auth/status`);
  } catch {
    throw new ApiRequestError('/auth/status', null);
  }
  if (!response.ok) throw new ApiRequestError('/auth/status', response.status);
  return (await response.json()) as AuthStatus;
}

/** An auth call's answer: the signed-in user, or the error code (null when offline or unreadable). */
export type AuthResult =
  | { readonly ok: true; readonly user: User }
  | { readonly ok: false; readonly error: ApiErrorCode | null };

async function authCall(
  fetchFn: Fetch,
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: SetupBody | SignInBody | ChangePasswordBody,
): Promise<{ readonly status: number; readonly body: unknown } | null> {
  try {
    const response = await fetchFn(`${API}${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text === '' ? null : (JSON.parse(text) as unknown) };
  } catch {
    return null;
  }
}

function authResult(answer: Awaited<ReturnType<typeof authCall>>): AuthResult {
  if (answer === null) return { ok: false, error: null };
  // First-party server contract: a 2xx carries a `User`, an error an `ApiError`.
  if (answer.status >= 200 && answer.status < 300) return { ok: true, user: answer.body as User };
  const error = (answer.body as Partial<ApiError> | null)?.error;
  return { ok: false, error: typeof error === 'string' ? error : null };
}

/** `POST /auth/setup` (UC11): creates the first owner and signs them in. */
export async function setUpOwner(body: SetupBody, fetchFn: Fetch = fetch): Promise<AuthResult> {
  return authResult(await authCall(fetchFn, '/auth/setup', 'POST', body));
}

/** `POST /auth/session` (UC13). */
export async function signIn(body: SignInBody, fetchFn: Fetch = fetch): Promise<AuthResult> {
  return authResult(await authCall(fetchFn, '/auth/session', 'POST', body));
}

/** `DELETE /auth/session` or, with `everywhere`, `DELETE /auth/sessions` (UC14). */
export async function signOut(everywhere: boolean, fetchFn: Fetch = fetch): Promise<boolean> {
  const answer = await authCall(fetchFn, everywhere ? '/auth/sessions' : '/auth/session', 'DELETE');
  return answer !== null && (answer.status === 204 || answer.status === 401);
}

/** `PUT /auth/password` (UC19): ok, or the error code (null when offline). */
export async function changePassword(
  body: ChangePasswordBody,
  fetchFn: Fetch = fetch,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: ApiErrorCode | null }> {
  const answer = await authCall(fetchFn, '/auth/password', 'PUT', body);
  if (answer?.status === 204) return { ok: true };
  const result = authResult(answer);
  return result.ok ? { ok: false, error: null } : result;
}
