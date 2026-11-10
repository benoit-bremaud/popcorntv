import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DISCOVER_KINDS, DISCOVER_LISTS } from '@popcorntv/shared';
import type {
  DiscoverDetails,
  DiscoverKind,
  DiscoverTitle,
  WatchProviders,
} from '@popcorntv/shared';
import { apiError, callerOf, invalid, MEDIA_ROUTE } from '../http.js';
import type { ArtworkCache } from '../metadata/artwork-cache.js';
import { TmdbRequestError } from '../metadata/tmdb-client.js';
import type { TmdbClient, TmdbSummary } from '../metadata/tmdb-client.js';
import type { ProfileRepository } from '../profiles/repository.js';
import { profileParams } from '../profiles/routes.js';
import { StaleCache } from './stale-cache.js';
import type { TitleFacts, WishlistRepository } from './wishlist-repository.js';

/** What the Discover routes need; `tmdb` and `artwork` are null without `TMDB_API_KEY`. */
export interface DiscoverRoutesDeps {
  readonly tmdb: TmdbClient | null;
  readonly artwork: ArtworkCache | null;
  /** The folder `artwork` writes to; posters are read back from it. */
  readonly artworkDir: string;
  readonly wishlist: WishlistRepository;
  readonly profiles: Pick<ProfileRepository, 'exists'>;
  /** The watch-provider memo, shared with the wishlist check (ADR-0030); built here if absent. */
  readonly providers?: StaleCache<WatchProviders>;
  /** Clock of the list memo; tests move it. */
  readonly now?: () => number;
}

/**
 * A TMDB list is fresh this long (ADR-0020): four calls per quarter hour at most. Past it, the
 * list is still served while one call refreshes it (ADR-0027).
 */
export const LIST_TTL_MS = 15 * 60_000;
/** Discover rows and search show this many titles at most (spec R1, R2). */
const MAX_TITLES = 20;
/** Discover posters are smaller than the library's `w500` (spec R8). */
export const DISCOVER_POSTER_SIZE = 'w342';
const CAST_SHOWN = 10;
/** Watch providers are fresh a day, then served stale while one call refreshes them (spec R3). */
export const PROVIDERS_TTL_MS = 24 * 60 * 60_000;
/** Titles whose watch providers are kept in memory (spec where-to-watch R3). */
export const PROVIDERS_MAX = 500;
/** Provider logos are small (spec where-to-watch R5). */
export const LOGO_SIZE = 'w92';
/**
 * Poster and logo paths the server has handed out and may therefore download (ADR-0020): a
 * viewer can never make the server fetch an arbitrary TMDB path. Each set forgets its oldest
 * path first past this size.
 */
export const ISSUED_PATHS_MAX = 2000;

const kind = z.enum(DISCOVER_KINDS);
const tmdbId = z.coerce.number().int().positive().max(2_147_483_647);
const listQuery = z.object({ list: z.enum(DISCOVER_LISTS), kind });
const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });
const titleParams = z.object({ kind, tmdbId });
const wishParams = profileParams.extend({ kind, tmdbId });
const imageParams = z.object({ file: z.string().regex(/^[A-Za-z0-9]+\.(?:jpg|png)$/) });

function toFacts(row: TmdbSummary): TitleFacts {
  return {
    kind: row.kind,
    tmdbId: row.id,
    title: row.title,
    year: row.year,
    overview: row.overview,
    voteAverage: row.vote_average,
    posterPath: row.poster_path,
  };
}

/** Adds `path` last to `paths` (recently shown kept longest), forgetting the oldest past the cap. */
function remember(paths: Set<string>, path: string | null): void {
  if (path === null) return;
  paths.delete(path);
  paths.add(path);
  if (paths.size > ISSUED_PATHS_MAX) {
    const oldest = paths.values().next().value;
    if (oldest !== undefined) paths.delete(oldest);
  }
}

/** The year of a TMDB date (`YYYY-MM-DD`), null when absent. */
function yearOf(date: string): number | null {
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/**
 * Marks an answer `viaTmdb` already sent. It never returns the reply itself: a Fastify 5 reply is
 * thenable, so an async function returning it resolves to `undefined` (#178).
 */
const SENT = Symbol('sent');

/**
 * Runs a TMDB call; on a TMDB failure it sends `404 title_not_found` or `502 tmdb_unavailable`
 * (spec R9) and returns `SENT`.
 */
async function viaTmdb<T>(reply: FastifyReply, call: () => Promise<T>): Promise<T | typeof SENT> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof TmdbRequestError) {
      // TMDB answers 404 for an id it does not know: the title, not TMDB, is missing.
      if (error.status === 404) {
        reply.code(404).send(apiError('title_not_found'));
      } else {
        reply.log.warn({ event: 'discover.tmdb.failed', err: error }, 'TMDB unavailable');
        reply.code(502).send(apiError('tmdb_unavailable'));
      }
      return SENT;
    }
    throw error;
  }
}

/** The sheet's facts read from TMDB `details` (spec R3). */
async function details(
  tmdb: TmdbClient,
  of: (typeof DISCOVER_KINDS)[number],
  id: number,
): Promise<Omit<DiscoverDetails, 'mediaId'>> {
  const body = await tmdb.details(of, id);
  return {
    kind: of,
    tmdbId: body.id,
    title: body.title,
    year: yearOf(body.date),
    overview: body.overview,
    voteAverage: body.vote_average,
    posterPath: body.poster_path,
    genres: body.genres.map((genre) => genre.name),
    cast: [...body.cast]
      .sort((a, b) => a.order - b.order)
      .slice(0, CAST_SHOWN)
      .map((member) => member.name),
  };
}

/**
 * The French offers of a title through `cache` (spec where-to-watch R3), served stale while one
 * call refreshes them: the providers route.
 */
export function watchProvidersOf(
  cache: StaleCache<WatchProviders>,
  tmdb: TmdbClient,
  logger: Pick<FastifyBaseLogger, 'warn'>,
): (kind: DiscoverKind, id: number) => Promise<WatchProviders> {
  return (of, id) =>
    cache.get(
      `${of}:${id}`,
      () => tmdb.watchProviders(of, id),
      (error) =>
        logger.warn(
          { event: 'discover.providers.refresh_failed', kind: of, tmdbId: id, err: error },
          'watch providers refresh failed',
        ),
    );
}

/**
 * The French offers of a title, fresh (≤ 24 h) or awaited: the wishlist check reads the route's
 * memo, so a title costs at most one TMDB call a day (spec wishlist-notifications R7).
 */
export function freshWatchProvidersOf(
  cache: StaleCache<WatchProviders>,
  tmdb: TmdbClient,
): (kind: DiscoverKind, id: number) => Promise<WatchProviders> {
  return (of, id) => cache.getFresh(`${of}:${id}`, () => tmdb.watchProviders(of, id));
}

/**
 * UC26 (spec discover-wishlist): `GET /discover`, `GET /discover/search`, `GET
 * /discover/:kind/:tmdbId`, `GET /discover/:kind/:tmdbId/providers` (UC27), `GET
 * /discover/poster/:file`, `GET /discover/logo/:file`, and `GET | PUT | DELETE` on
 * `/profiles/:profileId/wishlist[/:kind/:tmdbId]`. Every route needs a signed-in caller.
 */
export function registerDiscoverRoutes(app: FastifyInstance, deps: DiscoverRoutesDeps): void {
  const now = deps.now ?? Date.now;
  const lists = new StaleCache<readonly TitleFacts[]>(
    LIST_TTL_MS,
    DISCOVER_LISTS.length * DISCOVER_KINDS.length,
    now,
  );
  const issued = new Set<string>();
  const issuedLogos = new Set<string>();
  const providers =
    deps.providers ?? new StaleCache<WatchProviders>(PROVIDERS_TTL_MS, PROVIDERS_MAX, now);

  /** Records the poster paths of an answer so the poster route may serve them, then returns it. */
  function issue<T extends { readonly posterPath: string | null }>(titles: T[]): T[] {
    for (const { posterPath } of titles) remember(issued, posterPath);
    return titles;
  }

  /** The first `MAX_TITLES` of a TMDB list as Discover keeps them. */
  async function loadList(
    list: (typeof DISCOVER_LISTS)[number],
    of: (typeof DISCOVER_KINDS)[number],
    tmdb: TmdbClient,
  ): Promise<readonly TitleFacts[]> {
    return (await tmdb.list(list, of)).slice(0, MAX_TITLES).map(toFacts);
  }

  /**
   * ADR-0027: a stale list is served at once and refreshed behind the answer, one call at a
   * time (a visit during a refresh neither starts nor logs another).
   */
  function cachedList(
    list: (typeof DISCOVER_LISTS)[number],
    of: (typeof DISCOVER_KINDS)[number],
    tmdb: TmdbClient,
  ): Promise<readonly TitleFacts[]> {
    return lists.get(
      `${list}:${of}`,
      () => loadList(list, of, tmdb),
      (error) =>
        app.log.warn(
          { event: 'discover.list.refresh_failed', list, kind: of, err: error },
          'list refresh failed',
        ),
    );
  }

  // ADR-0027: the four lists are fetched once at start; a visit past the warm-up never waits.
  app.addHook('onReady', () => {
    const tmdb = deps.tmdb;
    if (!tmdb) return;
    for (const list of DISCOVER_LISTS) {
      for (const kindOf of DISCOVER_KINDS) {
        lists
          .load(`${list}:${kindOf}`, () => loadList(list, kindOf, tmdb))
          .catch((error: unknown) =>
            app.log.warn(
              { event: 'discover.list.warm_failed', list, kind: kindOf, err: error },
              'list warm-up failed',
            ),
          );
      }
    }
  });

  app.get('/discover', async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send(invalid(query.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const titles = await viaTmdb(reply, () => cachedList(query.data.list, query.data.kind, tmdb));
    if (titles === SENT) return reply;
    return reply.send(
      issue(deps.wishlist.withMediaIds<TitleFacts>(titles)) satisfies DiscoverTitle[],
    );
  });

  app.get('/discover/search', async (request, reply) => {
    const query = searchQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send(invalid(query.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const rows = await viaTmdb(reply, () => tmdb.searchTitles(query.data.q));
    if (rows === SENT) return reply;
    const titles = rows.slice(0, MAX_TITLES).map(toFacts);
    return reply.send(issue(deps.wishlist.withMediaIds(titles)) satisfies DiscoverTitle[]);
  });

  app.get('/discover/:kind/:tmdbId/providers', async (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const { kind: of, tmdbId: id } = params.data;
    const answer = await viaTmdb(reply, () => watchProvidersOf(providers, tmdb, app.log)(of, id));
    if (answer === SENT) return reply;
    for (const offer of answer.offers) remember(issuedLogos, offer.logoPath);
    return reply.send(answer satisfies WatchProviders);
  });

  app.get('/discover/:kind/:tmdbId', async (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const sheet = await viaTmdb(reply, () => details(tmdb, params.data.kind, params.data.tmdbId));
    if (sheet === SENT) return reply;
    const [withId] = issue(deps.wishlist.withMediaIds([sheet]));
    return reply.send(withId satisfies DiscoverDetails | undefined);
  });

  /** Serves an issued TMDB image of `paths` at `size` through the artwork cache. */
  function imageRoute(
    route: string,
    paths: ReadonlySet<string>,
    size: string,
    event: string,
  ): void {
    app.get(route, MEDIA_ROUTE, async (request, reply) => {
      const params = imageParams.safeParse(request.params);
      if (!params.success) return reply.code(400).send(invalid(params.error.issues));
      const artwork = deps.artwork;
      if (!artwork) return reply.code(409).send(apiError('tmdb_not_configured'));
      // Only a path this server handed out may reach TMDB (ADR-0020, adversarial review #127).
      if (!paths.has(`/${params.data.file}`)) {
        return reply.code(404).send(apiError('artwork_not_found'));
      }
      const file = await artwork.cache(`/${params.data.file}`, size, (error) =>
        request.log.warn({ event, err: error }, 'discover image download failed'),
      );
      if (file === null) return reply.code(404).send(apiError('artwork_not_found'));
      const bytes = await readFile(join(deps.artworkDir, file));
      return reply
        .header('cache-control', 'private, max-age=31536000, immutable')
        .type(file.endsWith('.png') ? 'image/png' : 'image/jpeg')
        .send(bytes);
    });
  }

  imageRoute('/discover/poster/:file', issued, DISCOVER_POSTER_SIZE, 'discover.poster.failed');
  imageRoute('/discover/logo/:file', issuedLogos, LOGO_SIZE, 'discover.logo.failed');

  app.get('/profiles/:profileId/wishlist', (request, reply) => {
    const params = profileParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      return reply.code(404).send(apiError('profile_not_found'));
    }
    return reply.send(issue(deps.wishlist.list(params.data.profileId)));
  });

  app.put('/profiles/:profileId/wishlist/:kind/:tmdbId', async (request, reply) => {
    const params = wishParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      return reply.code(404).send(apiError('profile_not_found'));
    }
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const { profileId, kind: of, tmdbId: id } = params.data;
    // The server reads the facts itself: the client sends no title data (spec R5).
    const sheet = await viaTmdb(reply, () => details(tmdb, of, id));
    if (sheet === SENT) return reply;
    deps.wishlist.add(profileId, {
      kind: sheet.kind,
      tmdbId: sheet.tmdbId,
      title: sheet.title,
      year: sheet.year,
      overview: sheet.overview,
      voteAverage: sheet.voteAverage,
      posterPath: sheet.posterPath,
    });
    return reply.code(204).send();
  });

  app.delete('/profiles/:profileId/wishlist/:kind/:tmdbId', (request, reply) => {
    const params = wishParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    if (!deps.profiles.exists(callerOf(request).userId, params.data.profileId)) {
      return reply.code(404).send(apiError('profile_not_found'));
    }
    deps.wishlist.remove(params.data.profileId, params.data.kind, params.data.tmdbId);
    return reply.code(204).send();
  });
}
