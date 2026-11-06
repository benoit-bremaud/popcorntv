import { isIP } from 'node:net';
import { resolve } from 'node:path';

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
  /** HLS sessions allowed at once; one more gets `503 transcode_busy`. */
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
}

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
  };
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

/** A finite integer ≥ 1, else the fallback: the session limit guards CPU and disk. */
function positiveInteger(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback;
}
