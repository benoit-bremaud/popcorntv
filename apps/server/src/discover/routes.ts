import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { DISCOVER_KINDS, DISCOVER_LISTS } from '@popcorntv/shared';
import type { DiscoverDetails, DiscoverTitle } from '@popcorntv/shared';
import { apiError, callerOf, invalid, MEDIA_ROUTE } from '../http.js';
import type { ArtworkCache } from '../metadata/artwork-cache.js';
import { TmdbRequestError } from '../metadata/tmdb-client.js';
import type { TmdbClient, TmdbSummary } from '../metadata/tmdb-client.js';
import type { ProfileRepository } from '../profiles/repository.js';
import { profileParams } from '../profiles/routes.js';
import type { TitleFacts, WishlistRepository } from './wishlist-repository.js';

/** What the Discover routes need; `tmdb` and `artwork` are null without `TMDB_API_KEY`. */
export interface DiscoverRoutesDeps {
  readonly tmdb: TmdbClient | null;
  readonly artwork: ArtworkCache | null;
  /** The folder `artwork` writes to; posters are read back from it. */
  readonly artworkDir: string;
  readonly wishlist: WishlistRepository;
  readonly profiles: Pick<ProfileRepository, 'exists'>;
  /** Clock of the list memo; tests move it. */
  readonly now?: () => number;
}

/** A TMDB list is reused this long (ADR-0020): four calls per quarter hour at most. */
export const LIST_TTL_MS = 15 * 60_000;
/** Discover rows and search show this many titles at most (spec R1, R2). */
const MAX_TITLES = 20;
/** Discover posters are smaller than the library's `w500` (spec R8). */
export const DISCOVER_POSTER_SIZE = 'w342';
const CAST_SHOWN = 10;
/**
 * Poster paths the server has handed out and may therefore download (ADR-0020): a viewer can
 * never make the server fetch an arbitrary TMDB path. Oldest forgotten first past this size.
 */
export const ISSUED_POSTERS_MAX = 2000;

const kind = z.enum(DISCOVER_KINDS);
const tmdbId = z.coerce.number().int().positive().max(2_147_483_647);
const listQuery = z.object({ list: z.enum(DISCOVER_LISTS), kind });
const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });
const titleParams = z.object({ kind, tmdbId });
const wishParams = profileParams.extend({ kind, tmdbId });
const posterParams = z.object({ file: z.string().regex(/^[A-Za-z0-9]+\.(?:jpg|png)$/) });

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

/** The year of a TMDB date (`YYYY-MM-DD`), null when absent. */
function yearOf(date: string): number | null {
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

/** Runs a TMDB call; a TMDB failure becomes `502 tmdb_unavailable` (spec R9). */
async function viaTmdb<T>(reply: FastifyReply, call: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof TmdbRequestError) {
      // TMDB answers 404 for an id it does not know: the title, not TMDB, is missing.
      if (error.status === 404) return reply.code(404).send(apiError('title_not_found'));
      reply.log.warn({ event: 'discover.tmdb.failed', err: error }, 'TMDB unavailable');
      return reply.code(502).send(apiError('tmdb_unavailable'));
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
 * UC26 (spec discover-wishlist): `GET /discover`, `GET /discover/search`, `GET
 * /discover/:kind/:tmdbId`, `GET /discover/poster/:file`, and `GET | PUT | DELETE` on
 * `/profiles/:profileId/wishlist[/:kind/:tmdbId]`. Every route needs a signed-in caller.
 */
export function registerDiscoverRoutes(app: FastifyInstance, deps: DiscoverRoutesDeps): void {
  const now = deps.now ?? Date.now;
  const memo = new Map<string, { readonly at: number; readonly titles: readonly TitleFacts[] }>();
  const issued = new Set<string>();

  /** Records the poster paths of an answer so the poster route may serve them, then returns it. */
  function issue<T extends { readonly posterPath: string | null }>(titles: T[]): T[] {
    for (const { posterPath } of titles) {
      if (posterPath === null) continue;
      issued.delete(posterPath); // Re-inserted last: recently shown paths are kept longest.
      issued.add(posterPath);
      if (issued.size > ISSUED_POSTERS_MAX) {
        const oldest = issued.values().next().value;
        if (oldest !== undefined) issued.delete(oldest);
      }
    }
    return titles;
  }

  async function cachedList(
    list: (typeof DISCOVER_LISTS)[number],
    of: (typeof DISCOVER_KINDS)[number],
    tmdb: TmdbClient,
  ): Promise<readonly TitleFacts[]> {
    const memoKey = `${list}:${of}`;
    const hit = memo.get(memoKey);
    if (hit !== undefined && now() - hit.at < LIST_TTL_MS) return hit.titles;
    const titles = (await tmdb.list(list, of)).slice(0, MAX_TITLES).map(toFacts);
    memo.set(memoKey, { at: now(), titles });
    return titles;
  }

  app.get('/discover', async (request, reply) => {
    const query = listQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send(invalid(query.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const titles = await viaTmdb(reply, () => cachedList(query.data.list, query.data.kind, tmdb));
    if (!Array.isArray(titles)) return titles;
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
    if (!Array.isArray(rows)) return rows;
    const titles = rows.slice(0, MAX_TITLES).map(toFacts);
    return reply.send(issue(deps.wishlist.withMediaIds(titles)) satisfies DiscoverTitle[]);
  });

  app.get('/discover/:kind/:tmdbId', async (request, reply) => {
    const params = titleParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const tmdb = deps.tmdb;
    if (!tmdb) return reply.code(409).send(apiError('tmdb_not_configured'));
    const sheet = await viaTmdb(reply, () => details(tmdb, params.data.kind, params.data.tmdbId));
    if (!('tmdbId' in sheet)) return sheet;
    const [withId] = issue(deps.wishlist.withMediaIds([sheet]));
    return reply.send(withId satisfies DiscoverDetails | undefined);
  });

  app.get('/discover/poster/:file', MEDIA_ROUTE, async (request, reply) => {
    const params = posterParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send(invalid(params.error.issues));
    const artwork = deps.artwork;
    if (!artwork) return reply.code(409).send(apiError('tmdb_not_configured'));
    // Only a path this server handed out may reach TMDB (ADR-0020, adversarial review #127).
    if (!issued.has(`/${params.data.file}`)) {
      return reply.code(404).send(apiError('artwork_not_found'));
    }
    const file = await artwork.cache(`/${params.data.file}`, DISCOVER_POSTER_SIZE, (error) =>
      request.log.warn(
        { event: 'discover.poster.failed', err: error },
        'discover poster download failed',
      ),
    );
    if (file === null) return reply.code(404).send(apiError('artwork_not_found'));
    const bytes = await readFile(join(deps.artworkDir, file));
    return reply
      .header('cache-control', 'private, max-age=31536000, immutable')
      .type(file.endsWith('.png') ? 'image/png' : 'image/jpeg')
      .send(bytes);
  });

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
    if (!('tmdbId' in sheet)) return sheet;
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
