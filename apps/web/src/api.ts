import type {
  Account,
  ApiError,
  ApiErrorCode,
  AuthEvent,
  AuthStatus,
  ChangePasswordBody,
  CreateLibraryBody,
  CreateProfileBody,
  DiscoverDetails,
  TitleLink,
  WatchProviders,
  DiscoverKind,
  DiscoverList,
  DiscoverTitle,
  DeviceSession,
  EnrichBody,
  EnrichReport,
  Invitation,
  IssuedLink,
  Library,
  Media,
  MediaFolderList,
  MyProvider,
  NotificationList,
  PlaybackSessionBody,
  PlaybackStart,
  Profile,
  ProgressBody,
  RedeemBody,
  RenameLibraryBody,
  Role,
  ScanReport,
  SetupBody,
  SignInBody,
  UpdateProfileBody,
  User,
  VersionResponse,
  WatchProgress,
  WishlistEntry,
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

/** The libraries and the media of all of them, in library order. */
export interface Catalog {
  readonly libraries: readonly Library[];
  readonly media: readonly Media[];
}

/** Every media of every library (sequence diagram 02); `fetchFn` is injected for tests. */
export async function loadCatalog(fetchFn: Fetch = fetch): Promise<Catalog> {
  const libraries = await getList<Library>(fetchFn, '/libraries');
  const perLibrary = await Promise.all(
    libraries.map((library) =>
      getList<Media>(fetchFn, `/libraries/${encodeURIComponent(library.id)}/media`),
    ),
  );
  return { libraries, media: perLibrary.flat() };
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

/**
 * `PUT | DELETE /profiles/:profileId/media/:id/watched` (spec watched-marks R2, R3); a
 * series applies to its episodes. False when the server refused or was unreachable.
 */
export async function setWatched(
  profileId: string,
  mediaId: string,
  value: boolean,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(
      `${API}${profilePath(profileId)}/media/${encodeURIComponent(mediaId)}/watched`,
      { method: value ? 'PUT' : 'DELETE' },
    );
    return response.ok;
  } catch {
    return false;
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

/** URL of a Discover poster served by `GET /discover/poster/:file` (spec discover-wishlist R8). */
export function posterUrl(posterPath: string): string {
  return `${API}/discover/poster/${encodeURIComponent(posterPath.replace(/^\//, ''))}`;
}

/** URL of a provider logo served by `GET /discover/logo/:file` (spec where-to-watch R5). */
export function logoUrl(logoPath: string): string {
  return `${API}/discover/logo/${encodeURIComponent(logoPath.replace(/^\//, ''))}`;
}

/** `GET /discover/:kind/:tmdbId/providers` (UC27 R1): the French legal offers. */
export async function loadWatchProviders(
  kind: DiscoverKind,
  tmdbId: number,
  fetchFn: Fetch = fetch,
): Promise<WatchProviders> {
  const path = `/discover/${kind}/${tmdbId}/providers`;
  let response: Response;
  try {
    response = watched(await fetchFn(`${API}${path}`));
  } catch {
    throw new ApiRequestError(path, null);
  }
  if (!response.ok) throw new ApiRequestError(path, response.status);
  return (await response.json()) as WatchProviders;
}

/** `GET /discover?list=&kind=` (UC26 R1); throws `ApiRequestError` like the catalog load. */
export async function loadDiscover(
  list: DiscoverList,
  kind: DiscoverKind,
  fetchFn: Fetch = fetch,
): Promise<DiscoverTitle[]> {
  return getList<DiscoverTitle>(fetchFn, `/discover?list=${list}&kind=${kind}`);
}

/** `GET /discover/search?q=` (UC26 R2). */
export async function searchDiscover(
  query: string,
  fetchFn: Fetch = fetch,
): Promise<DiscoverTitle[]> {
  return getList<DiscoverTitle>(fetchFn, `/discover/search?q=${encodeURIComponent(query)}`);
}

/** `GET /discover/:kind/:tmdbId` (UC26 R3): the title sheet. */
export async function loadDiscoverDetails(
  kind: DiscoverKind,
  tmdbId: number,
  fetchFn: Fetch = fetch,
): Promise<DiscoverDetails> {
  const path = `/discover/${kind}/${tmdbId}`;
  let response: Response;
  try {
    response = watched(await fetchFn(`${API}${path}`));
  } catch {
    throw new ApiRequestError(path, null);
  }
  if (!response.ok) throw new ApiRequestError(path, response.status);
  return (await response.json()) as DiscoverDetails;
}

/** `GET /profiles/:profileId/wishlist` (UC26 R6); an unreachable server means an empty list. */
export async function loadWishlist(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<WishlistEntry[]> {
  try {
    return await getList<WishlistEntry>(fetchFn, `${profilePath(profileId)}/wishlist`);
  } catch {
    return [];
  }
}

/** `PUT | DELETE /profiles/:profileId/wishlist/:kind/:tmdbId` (UC26 R5); false when refused. */
export async function setWishlisted(
  profileId: string,
  kind: DiscoverKind,
  tmdbId: number,
  value: boolean,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(`${API}${profilePath(profileId)}/wishlist/${kind}/${tmdbId}`, {
      method: value ? 'PUT' : 'DELETE',
    });
    return watched(response).ok;
  } catch {
    return false;
  }
}

/** `GET /profiles/:profileId/notifications` (UC28 R10); throws `ApiRequestError` when refused. */
export async function loadNotifications(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<NotificationList> {
  const path = `${profilePath(profileId)}/notifications`;
  let response: Response;
  try {
    response = watched(await fetchFn(`${API}${path}`));
  } catch {
    throw new ApiRequestError(path, null);
  }
  if (!response.ok) throw new ApiRequestError(path, response.status);
  const body = (await response.json()) as Partial<NotificationList> | null;
  if (!Array.isArray(body?.items)) throw new ApiRequestError(path, response.status);
  return body as NotificationList;
}

/** `PUT /profiles/:profileId/notifications/read` (UC28 R10); false when refused. */
export async function markNotificationsRead(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(`${API}${profilePath(profileId)}/notifications/read`, {
      method: 'PUT',
    });
    return watched(response).ok;
  } catch {
    return false;
  }
}

/** `GET /profiles/:profileId/providers` (UC29 R1); an unreachable server means none. */
export async function loadMyProviders(
  profileId: string,
  fetchFn: Fetch = fetch,
): Promise<MyProvider[]> {
  try {
    return await getList<MyProvider>(fetchFn, `${profilePath(profileId)}/providers`);
  } catch {
    return [];
  }
}

/** `PUT | DELETE /profiles/:profileId/providers/:providerId` (UC29 R1); false when refused. */
export async function setMyProvider(
  profileId: string,
  provider: MyProvider,
  value: boolean,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  try {
    const url = `${API}${profilePath(profileId)}/providers/${provider.providerId}`;
    const response = await fetchFn(
      url,
      value
        ? {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: provider.name }),
          }
        : { method: 'DELETE' },
    );
    return watched(response).ok;
  } catch {
    return false;
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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: SetupBody | SignInBody | ChangePasswordBody | RedeemBody | AdminBody,
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

/** `POST /auth/redeem` (UC12, UC20): an invitation or a reset link, then signed in. */
export async function redeem(body: RedeemBody, fetchFn: Fetch = fetch): Promise<AuthResult> {
  return authResult(await authCall(fetchFn, '/auth/redeem', 'POST', body));
}

/** An owner call's answer: the body on success, or the error code (null when offline). */
export type AdminResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiErrorCode | null };

/** What an owner administration call may send. */
type AdminBody = { readonly role: Role } | CreateLibraryBody | RenameLibraryBody | EnrichBody;

/** Owner administration calls (UC15–UC18, UC21); a `401` sends the gate back to sign-in. */
async function adminCall<T>(
  fetchFn: Fetch,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: AdminBody,
): Promise<AdminResult<T>> {
  const answer = await authCall(fetchFn, path, method, body);
  if (answer?.status === 401) unauthenticated();
  if (answer === null) return { ok: false, error: null };
  // First-party server contract: a 2xx carries `T` (null for 204), an error an `ApiError`.
  if (answer.status >= 200 && answer.status < 300) return { ok: true, value: answer.body as T };
  const error = (answer.body as Partial<ApiError> | null)?.error;
  return { ok: false, error: typeof error === 'string' ? error : null };
}

/** The owner administration API (spec auth §4.2); `fetchFn` is injected in tests. */
export function adminApi(fetchFn: Fetch = (...args) => fetch(...args)) {
  return {
    accounts: () => adminCall<Account[]>(fetchFn, '/users', 'GET'),
    setRole: (id: string, role: Role) =>
      adminCall<User>(fetchFn, `/users/${id}`, 'PATCH', { role }),
    deleteAccount: (id: string) => adminCall<null>(fetchFn, `/users/${id}`, 'DELETE'),
    devices: (id: string) => adminCall<DeviceSession[]>(fetchFn, `/users/${id}/sessions`, 'GET'),
    endSessions: (id: string, sessionId?: string) =>
      adminCall<null>(
        fetchFn,
        sessionId === undefined ? `/users/${id}/sessions` : `/users/${id}/sessions/${sessionId}`,
        'DELETE',
      ),
    issueReset: (id: string) => adminCall<IssuedLink>(fetchFn, `/users/${id}/reset`, 'POST'),
    revokeReset: (id: string) => adminCall<null>(fetchFn, `/users/${id}/reset`, 'DELETE'),
    invitations: () => adminCall<Invitation[]>(fetchFn, '/invitations', 'GET'),
    invite: (role: Role) => adminCall<IssuedLink>(fetchFn, '/invitations', 'POST', { role }),
    revokeInvitation: (id: string) => adminCall<null>(fetchFn, `/invitations/${id}`, 'DELETE'),
    events: () => adminCall<AuthEvent[]>(fetchFn, '/auth/events', 'GET'),
    // UC21 (spec library-management); UC1 and UC2 started from the same section.
    libraries: () => adminCall<Library[]>(fetchFn, '/libraries', 'GET'),
    folders: () => adminCall<MediaFolderList>(fetchFn, '/libraries/folders', 'GET'),
    createLibrary: (body: CreateLibraryBody) =>
      adminCall<Library>(fetchFn, '/libraries', 'POST', body),
    renameLibrary: (id: string, name: string) =>
      adminCall<Library>(fetchFn, `/libraries/${id}`, 'PATCH', { name }),
    deleteLibrary: (id: string) => adminCall<null>(fetchFn, `/libraries/${id}`, 'DELETE'),
    scan: (id: string) => adminCall<ScanReport>(fetchFn, `/libraries/${id}/scan`, 'POST'),
    enrich: (id: string, refresh: boolean) =>
      adminCall<EnrichReport>(fetchFn, `/libraries/${id}/enrich`, 'POST', { refresh }),
  };
}

export type AdminApi = ReturnType<typeof adminApi>;

/** `GET /version` (spec app-version): the running build, or null when it cannot be read. */
export async function loadVersion(fetchFn: Fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchFn(`${API}/version`);
    if (!response.ok) return null;
    return ((await response.json()) as VersionResponse).version;
  } catch {
    return null;
  }
}

/** `GET /title-links/:kind/:tmdbId` (UC30 R2); throws `ApiRequestError` when refused. */
export async function loadTitleLink(
  kind: DiscoverKind,
  tmdbId: number,
  fetchFn: Fetch = fetch,
): Promise<TitleLink> {
  const path = `/title-links/${kind}/${tmdbId}`;
  let response: Response;
  try {
    response = watched(await fetchFn(`${API}${path}`));
  } catch {
    throw new ApiRequestError(path, null);
  }
  if (!response.ok) throw new ApiRequestError(path, response.status);
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('editable' in body) || !('url' in body)) {
    throw new ApiRequestError(path, response.status);
  }
  return body as TitleLink;
}

/**
 * `PUT /title-links/:kind/:tmdbId` with `url`, or `DELETE` when `url` is null (UC30 R3); false
 * when the server refused (invalid link, not an owner) or was unreachable.
 */
export async function saveTitleLink(
  kind: DiscoverKind,
  tmdbId: number,
  url: string | null,
  fetchFn: Fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(
      `${API}/title-links/${kind}/${tmdbId}`,
      url === null
        ? { method: 'DELETE' }
        : {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          },
    );
    return watched(response).ok;
  } catch {
    return false;
  }
}
