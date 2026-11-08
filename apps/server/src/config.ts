import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { LOG_LEVELS } from './logging.js';
import type { LogLevel } from './logging.js';

/** Runtime configuration, read once from the environment (see `.env.example`). */
export interface ServerConfig {
  readonly port: number;
  /** Loopback by default; Docker sets `0.0.0.0` on a private network behind the proxy (spec auth §5). */
  readonly host: string;
  readonly databasePath: string;
  /** Absolute folder every library root must live under (`POST /libraries` rejects the rest). */
  readonly mediaRoot: string;
  readonly ffprobePath: string;
  readonly ffmpegPath: string;
  /** Absolute parent of the HLS session directories; leftover `session-*` ones are removed at start. */
  readonly transcodeDir: string;
  /** HLS sessions allowed at once; past it a Play takes a slot over or gets `503` (R5b). */
  readonly transcodeMaxSessions: number;
  /** TMDB API Read Access Token (sent as Bearer); null disables UC2 (ADR-0003). Never logged. */
  readonly tmdbApiKey: string | null;
  /** `language` sent on every TMDB request, e.g. `en-US`, `fr-FR`. */
  readonly tmdbLanguage: string;
  /** Absolute folder the artwork cache writes to and `GET /artwork/:file` serves from. */
  readonly artworkDir: string;
  /**
   * The one origin every browser uses (spec auth R6): drives the cookie flags, the CSRF
   * check and the links. Required; dev value `http://localhost:5173`.
   */
  readonly publicUrl: string;
  /**
   * The reverse proxy's addresses or CIDRs, comma-separated (spec auth §5): only a socket peer
   * in this list may set the client IP through `X-Forwarded-For`. Null trusts no peer.
   */
  readonly trustProxy: string | null;
  /** Minutes between two automatic rescans of every library; 0 disables them (spec scheduled-scan R1). */
  readonly scanIntervalMin: number;
  /** pino level from `LOG_LEVEL`, `info` by default (spec logging R1). */
  readonly logLevel: LogLevel;
  /** The build baked at `docker build` (`APP_VERSION`), `dev` when unset (spec app-version R1). */
  readonly appVersion: string;
}

/** A tag (`v1.2.0-rc.1`), a short SHA or `git describe` output: printable, no markup. */
const APP_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;

/** The `.env.example` value: a copied example file must not count as a configured key. */
const TMDB_PLACEHOLDER = 'your-tmdb-read-access-token';

/** Builds the configuration from an environment map; defaults match `.env.example`. Throws without a valid `PUBLIC_URL`. */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const tmdbApiKey = env['TMDB_API_KEY']?.trim();
  const publicUrl = parsePublicUrl(env['PUBLIC_URL']);
  return {
    port: Number(env['PORT'] ?? 3000),
    host: env['HOST'] ?? '127.0.0.1',
    databasePath: env['DATABASE_PATH'] ?? 'data/popcorntv.sqlite',
    mediaRoot: resolve(env['MEDIA_ROOT'] ?? 'media'),
    ffprobePath: env['FFPROBE_PATH'] ?? 'ffprobe',
    ffmpegPath: env['FFMPEG_PATH'] ?? 'ffmpeg',
    transcodeDir: resolve(env['TRANSCODE_DIR'] ?? 'data/transcode'),
    transcodeMaxSessions: positiveInteger(env['TRANSCODE_MAX_SESSIONS'], 1),
    // The .env.example placeholder must not count as a key.
    tmdbApiKey: tmdbApiKey && tmdbApiKey !== TMDB_PLACEHOLDER ? tmdbApiKey : null,
    tmdbLanguage: env['TMDB_LANGUAGE'] ?? 'en-US',
    artworkDir: resolve(env['ARTWORK_DIR'] ?? 'data/artwork'),
    publicUrl,
    trustProxy: parseTrustProxy(env['TRUST_PROXY']),
    scanIntervalMin: scanInterval(env['SCAN_INTERVAL_MIN'], 60),
    logLevel: parseLogLevel(env['LOG_LEVEL']),
    appVersion: parseAppVersion(env['APP_VERSION']),
  };
}

/** `APP_VERSION`, refused when it is not a plausible tag or SHA rather than shown as is. */
function parseAppVersion(value: string | undefined): string {
  const version = value?.trim();
  if (!version) return 'dev';
  if (!APP_VERSION_PATTERN.test(version)) {
    throw new Error(
      'APP_VERSION must be a tag or a commit SHA ([0-9A-Za-z.+_-], 64 characters at most)',
    );
  }
  return version;
}

/** An absolute `http(s)` URL without credentials, query or fragment, kept as its origin. */
function parsePublicUrl(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('PUBLIC_URL is required (e.g. http://localhost:5173 in dev)');
  }
  const url = URL.parse(value.trim());
  if (url === null || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error('PUBLIC_URL must be an absolute http(s) URL');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_URL must be an origin only (no path, query, fragment or credentials)');
  }
  return url.origin;
}

/**
 * The start-up warning for an https `PUBLIC_URL` without `TRUST_PROXY`, or null: behind the
 * proxy every client would share its address, and one stranger could lock the household out
 * (spec auth R8).
 */
export function trustProxyWarning(
  config: Pick<ServerConfig, 'publicUrl' | 'trustProxy'>,
): string | null {
  return config.publicUrl.startsWith('https:') && config.trustProxy === null
    ? 'PUBLIC_URL is https but TRUST_PROXY is not set: the limiter sees the proxy address'
    : null;
}

/** Addresses or CIDRs only: `1` or `true` would trust any peer to forge the client IP. */
function parseTrustProxy(value: string | undefined): string | null {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.every((entry) => entry === '0')) return null;
  if (!entries.every(isAddressOrCidr)) {
    throw new Error('TRUST_PROXY must list proxy addresses or CIDRs (e.g. 172.18.0.10)');
  }
  return entries.join(',');
}

function isAddressOrCidr(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) return false;
  if (prefix === undefined) return true;
  const bits = Number(prefix);
  return /^[1-9]\d{0,2}$/.test(prefix) && bits <= (family === 4 ? 32 : 128);
}

/** Node caps a timer delay at 2³¹−1 ms; a longer one would fire every millisecond. */
const MAX_SCAN_INTERVAL_MIN = Math.floor((2 ** 31 - 1) / 60_000);

/** Whole minutes from 0 (disabled) to the timer cap, else the fallback. */
function scanInterval(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_SCAN_INTERVAL_MIN ? n : fallback;
}

/** A finite integer ≥ 1, else the fallback: the session limit guards CPU and disk. */
function positiveInteger(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback;
}

/** One of the pino levels, case-insensitive; a typo fails the start rather than going silent. */
function parseLogLevel(value: string | undefined): LogLevel {
  const level = (value ?? '').trim().toLowerCase();
  if (level === '') return 'info';
  const known = LOG_LEVELS.find((candidate) => candidate === level);
  if (known === undefined) throw new Error(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`);
  return known;
}
