import { join } from 'node:path';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiError, HealthResponse } from '@popcorntv/shared';
import { apiError } from './http.js';
import { EventRepository } from './auth/event-repository.js';
import { Argon2Hasher, HasherBusyError } from './auth/hasher.js';
import type { Hasher } from './auth/hasher.js';
import { cookiePolicy, registerAuthHook } from './auth/hook.js';
import { clientKey, LoginLimiter } from './auth/limiter.js';
import { registerAuthRoutes } from './auth/routes.js';
import { SessionRepository } from './auth/session-repository.js';
import { SetupToken } from './auth/setup-token.js';
import { TokenRepository } from './auth/token-repository.js';
import { UserRepository } from './auth/user-repository.js';
import { registerUserRoutes } from './auth/user-routes.js';
import type { AppDatabase } from './db/index.js';
import type { Prober } from './library/ffprobe.js';
import { LibraryRepository } from './library/repository.js';
import { LibraryLock } from './library/lock.js';
import { registerLibraryRoutes } from './library/routes.js';
import { LibraryScanner } from './library/scanner.js';
import { ArtworkCache } from './metadata/artwork-cache.js';
import { MetadataRepository } from './metadata/repository.js';
import { registerMetadataRoutes } from './metadata/routes.js';
import { MetadataService } from './metadata/service.js';
import { ProgressRepository } from './progress/repository.js';
import { registerProgressRoutes } from './progress/routes.js';
import { ProfileRepository } from './profiles/repository.js';
import { registerProfileRoutes } from './profiles/routes.js';
import { registerPlaybackRoutes } from './playback/routes.js';
import { SessionManager } from './playback/session-manager.js';
import { registerSessionRoutes } from './playback/session-routes.js';
import { SubtitleExtractor } from './playback/subtitle-extractor.js';
import { registerSubtitleRoutes } from './playback/subtitle-routes.js';
import type { Transcoder } from './playback/transcoder.js';
import type { TmdbClient } from './metadata/tmdb-client.js';

/**
 * Sent on every response: no MIME sniffing, no referrer leak, no cross-origin loading (CORP).
 * CORP `same-origin` requires the web build to be served from the API's origin (the Vite
 * proxy in dev, the reverse proxy in production), or `<video>`, `<img>` and hls.js loads break.
 */
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
} as const;

/** Everything `buildApp` needs; `index.ts` fills it from the config, tests from fakes. */
export interface AppOptions {
  readonly version: string;
  readonly db: AppDatabase;
  /** Process boundary, injected so tests never spawn ffprobe. */
  readonly probe: Prober;
  /** Absolute folder library roots must live under (`ServerConfig.mediaRoot`). */
  readonly mediaRoot: string;
  /** HTTP boundary to TMDB; null when no key is configured (UC2 disabled). */
  readonly tmdb: TmdbClient | null;
  /** Folder the artwork cache writes to and `GET /artwork/:file` serves from. */
  readonly artworkDir: string;
  /** Process boundary to FFmpeg, injected so tests never spawn it (ADR-0006). */
  readonly transcoder: Transcoder;
  /** Parent of the HLS session directories (`ServerConfig.transcodeDir`). */
  readonly transcodeDir: string;
  readonly transcodeMaxSessions?: number;
  /** `ServerConfig.publicUrl`: cookie flags, CSRF origin and the setup link (spec auth R6). */
  readonly publicUrl: string;
  /**
   * `ServerConfig.trustProxy`: from these proxy addresses or CIDRs only, `request.ip` comes
   * from `X-Forwarded-For` (spec auth §5).
   */
  readonly trustProxy?: string | null;
  /** Injected so tests hash fast; argon2id with the spec parameters otherwise. */
  readonly hasher?: Hasher;
  /**
   * Receives the raw first-owner setup link while no user exists (UC11). Defaults to a log
   * line: it is the only place the token ever appears.
   */
  readonly onSetupLink?: (link: string) => void;
  /** API requests per client per minute before `429` (spec auth R13); lowered by tests. */
  readonly rateLimitMax?: number;
  readonly logger?: boolean;
}

/** Spec auth R13: far above what browsing sends, far below what a script can. */
const RATE_LIMIT_MAX = 300;
/** Media routes get their own bucket, this many times larger (spec auth R13). */
const MEDIA_FACTOR = 10;

/** Builds the HTTP application without listening — the tests inject requests directly. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  // Trust the listed proxy addresses only, never `true`: a peer outside the list (another
  // container, a local process) cannot forge the client IP, and the right-most address not
  // in the list is the client, so a forged left-most entry is ignored.
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });

  // An empty JSON body means "no body" (#122, spec library-management R8): `curl -H
  // 'content-type: application/json' -X POST …/scan` must not fail. Anything else keeps
  // Fastify's own parser, prototype-poisoning checks included.
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body.toString();
    if (text === '') {
      done(null, undefined);
      return;
    }
    parseJson(request, text, done);
  });

  // On every reply, errors and streamed media included. The CSP and `frame-ancestors`
  // belong to whatever serves the web build.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    // Answers carry accounts, addresses and progress: no browser or shared-device cache keeps
    // them unless the route chose a policy itself (artwork).
    if (!reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  // Unexpected errors are logged with their cause but never echoed (SQLite messages, paths).
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // A saturated password hasher is a rate limit, not a server fault (spec auth R4).
    if (error instanceof HasherBusyError) {
      return reply.code(429).header('retry-after', '2').send(apiError('too_many_attempts'));
    }
    const status = error.statusCode ?? 500;
    if (status === 429) return reply.code(429).send(apiError('too_many_requests'));
    if (status >= 500) request.log.error(error);
    const body: ApiError = { error: status >= 500 ? 'internal' : 'invalid_request' };
    return reply.code(status).send(body);
  });

  // Global per-client limit (spec auth R13, ADR-0011), a root hook added before the auth
  // hook so it also counts unauthenticated and unmatched requests. Keyed on `request.ip`
  // (trusted proxies only) through `clientKey`, so an IPv6 client counts by its /64. Routes
  // marked `MEDIA_ROUTE` count in a separate, larger bucket: a player bursts there, but a
  // flood of forged cookies is still capped. `LoginLimiter` stays the per-username guard.
  const apiMax = options.rateLimitMax ?? RATE_LIMIT_MAX;
  const isMedia = (request: FastifyRequest): boolean =>
    request.routeOptions.config?.rateBucket === 'media';
  await app.register(rateLimit, {
    global: false,
    // The budget is not advertised on ordinary answers.
    addHeadersOnExceeding: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false,
    },
  });
  app.addHook(
    'onRequest',
    app.rateLimit({
      max: (request) => (isMedia(request) ? apiMax * MEDIA_FACTOR : apiMax),
      timeWindow: 60_000,
      keyGenerator: (request) => `${isMedia(request) ? 'media' : 'api'}:${clientKey(request.ip)}`,
      // Thrown to the error handler above, which answers `{ error: 'too_many_requests' }`;
      // the plugin has already set `retry-after`.
      errorResponseBuilder: () => ({ statusCode: 429 }),
    }),
  );

  const cookie = cookiePolicy(options.publicUrl);
  const sessionRepository = new SessionRepository(options.db);
  registerAuthHook(app, { sessions: sessionRepository, cookie });

  // Docker polls it; it reads nothing, so it counts in the larger media bucket.
  app.get('/health', { config: { access: 'public', rateBucket: 'media' } }, (): HealthResponse => ({
    status: 'ok',
    version: options.version,
  }));

  const repository = new LibraryRepository(options.db);
  const lock = new LibraryLock();
  const scanner = new LibraryScanner(repository, options.probe, options.mediaRoot);
  const metadata = options.tmdb
    ? new MetadataService({
        repository: new MetadataRepository(options.db),
        client: options.tmdb,
        artwork: new ArtworkCache(options.artworkDir, options.tmdb),
        logger: app.log,
      })
    : null;
  registerLibraryRoutes(app, {
    repository,
    scanner,
    lock,
    mediaRoot: options.mediaRoot,
    enrich: metadata ? (library) => metadata.enrich(library) : null,
  });
  registerMetadataRoutes(app, {
    repository,
    service: metadata,
    lock,
    artworkDir: options.artworkDir,
  });
  registerPlaybackRoutes(app, { repository, mediaRoot: options.mediaRoot });
  const extractor = new SubtitleExtractor({
    transcoder: options.transcoder,
    dir: join(options.transcodeDir, 'subtitles'),
  });
  registerSubtitleRoutes(app, { repository, extractor, mediaRoot: options.mediaRoot });
  const sessions = new SessionManager({
    transcoder: options.transcoder,
    dir: options.transcodeDir,
    maxSessions: options.transcodeMaxSessions ?? 1,
    logger: app.log,
  });
  registerSessionRoutes(app, { repository, sessions, mediaRoot: options.mediaRoot });
  const profiles = new ProfileRepository(options.db);
  registerProfileRoutes(app, { profiles });
  const users = new UserRepository(options.db);
  const events = new EventRepository(options.db);
  const setupToken = new SetupToken();
  const tokens = new TokenRepository(options.db);
  registerAuthRoutes(app, {
    db: options.db,
    users,
    sessions: sessionRepository,
    events,
    hasher: options.hasher ?? new Argon2Hasher(),
    limiter: new LoginLimiter(),
    setupToken,
    tokens,
    profiles,
    cookie,
  });
  registerUserRoutes(app, {
    db: options.db,
    users,
    sessions: sessionRepository,
    tokens,
    events,
    origin: cookie.origin,
  });
  registerProgressRoutes(app, { progress: new ProgressRepository(options.db), profiles });
  // Sessions live in memory: directories left by a previous run belong to no one.
  app.addHook('onReady', async () => {
    await sessions.clean();
    const now = new Date();
    sessionRepository.purge(now);
    events.purge(now);
    tokens.purge(now);
    if (users.isEmpty()) {
      const link = `${cookie.origin}/#/setup/${setupToken.issue()}`;
      (
        options.onSetupLink ??
        ((l) => app.log.warn({ setupLink: l }, 'no account yet: open the setup link (valid 1 h)'))
      )(link);
    }
  });
  // preClose runs before the server waits for open responses (a film stream can last hours).
  app.addHook('preClose', async () => {
    extractor.closeAll();
    await sessions.closeAll();
  });

  return app;
}
