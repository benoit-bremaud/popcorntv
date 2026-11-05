import { join } from 'node:path';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError, HealthResponse } from '@popcorntv/shared';
import { EventRepository } from './auth/event-repository.js';
import { Argon2Hasher, HasherBusyError } from './auth/hasher.js';
import type { Hasher } from './auth/hasher.js';
import { cookiePolicy, registerAuthHook } from './auth/hook.js';
import { LoginLimiter } from './auth/limiter.js';
import { registerAuthRoutes } from './auth/routes.js';
import { SessionRepository } from './auth/session-repository.js';
import { SetupToken } from './auth/setup-token.js';
import { UserRepository } from './auth/user-repository.js';
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
  /** Behind a reverse proxy, `request.ip` comes from `X-Forwarded-For` (spec auth §5). */
  readonly trustProxy?: boolean;
  /** Injected so tests hash fast; argon2id with the spec parameters otherwise. */
  readonly hasher?: Hasher;
  /**
   * Receives the raw first-owner setup link while no user exists (UC11). Defaults to a log
   * line: it is the only place the token ever appears.
   */
  readonly onSetupLink?: (link: string) => void;
  readonly logger?: boolean;
}

/** Builds the HTTP application without listening — the tests inject requests directly. */
export function buildApp(options: AppOptions): FastifyInstance {
  // Trust one hop, not `true`: the socket peer is the proxy, and only the entry it
  // appended to X-Forwarded-For is believed; a forged left-most entry is ignored.
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ? (_address: string, hop: number) => hop === 0 : false,
  });

  // On every reply, errors and streamed media included. The CSP and `frame-ancestors`
  // belong to whatever serves the web build.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers(SECURITY_HEADERS);
    return payload;
  });

  // Unexpected errors are logged with their cause but never echoed (SQLite messages, paths).
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // A saturated password hasher is a rate limit, not a server fault (spec auth R4).
    if (error instanceof HasherBusyError) {
      return reply.code(429).header('retry-after', '2').send({ error: 'too_many_attempts' });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) request.log.error(error);
    const body: ApiError = { error: status >= 500 ? 'internal' : 'invalid_request' };
    return reply.code(status).send(body);
  });

  const cookie = cookiePolicy(options.publicUrl);
  const sessionRepository = new SessionRepository(options.db);
  registerAuthHook(app, { sessions: sessionRepository, cookie });

  app.get('/health', { config: { access: 'public' } }, async (): Promise<HealthResponse> => ({
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
  registerAuthRoutes(app, {
    db: options.db,
    users,
    sessions: sessionRepository,
    events,
    hasher: options.hasher ?? new Argon2Hasher(),
    limiter: new LoginLimiter(),
    setupToken,
    profiles,
    cookie,
  });
  registerProgressRoutes(app, { progress: new ProgressRepository(options.db), profiles });
  // Sessions live in memory: directories left by a previous run belong to no one.
  app.addHook('onReady', async () => {
    await sessions.clean();
    const now = new Date();
    sessionRepository.purge(now);
    events.purge(now);
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
