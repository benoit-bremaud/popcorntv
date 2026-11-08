import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIBRARY_KINDS } from '@popcorntv/shared';
import type {
  EnrichReport,
  Library,
  Media,
  MediaFolderList,
  ScanReport,
  SkipReason,
} from '@popcorntv/shared';
import { apiError, invalid, loadLibrary } from '../http.js';
import { listSubFolders } from './folder-lister.js';
import { LibraryBusyError } from './lock.js';
import type { LibraryLock } from './lock.js';
import { hasControlChar, isAtOrUnderRoot, rootsOverlap } from './path-guard.js';
import type { LibraryRepository } from './repository.js';
import { RootUnreadableError, realRoot } from './scanner.js';
import type { LibraryScanner } from './scanner.js';

/** Owner-only routes (spec auth §4.4). */
const OWNER = { config: { access: 'owner' } } as const;

/** What the library routes need; built by `buildApp`, replaced by tests at will. */
export interface LibraryRoutesDeps {
  readonly repository: LibraryRepository;
  readonly scanner: LibraryScanner;
  /** Shared with the metadata routes: a scan (plus its include) and an enrich never overlap. */
  readonly lock: LibraryLock;
  /** Absolute folder every `rootPath` must equal or live under (`ServerConfig.mediaRoot`). */
  readonly mediaRoot: string;
  /**
   * UC1's «include» of UC2: runs after a scan on the rows without metadata. Null when
   * `TMDB_API_KEY` is not configured (the report then carries `metadata: null`).
   */
  readonly enrich: ((library: Library) => Promise<EnrichReport>) | null;
}

/**
 * `POST /libraries` (201 | 400 `invalid_request` | 409 `root_unreadable` / `root_in_use`), `GET /libraries`,
 * `GET /libraries/folders`, `PATCH /libraries/:id` (200 | 400 | 404),
 * `DELETE /libraries/:id` (204 | 400 | 404 | 409 `scan_running`),
 * `POST /libraries/:id/scan` (200 | 400 | 404 `library_not_found` | 409 `root_unreadable` /
 * `scan_running` — a scan *or an enrichment* of the library is in flight),
 * `GET /libraries/:id/media` (200 | 400 | 404).
 */
export function registerLibraryRoutes(app: FastifyInstance, deps: LibraryRoutesDeps): void {
  const libraryName = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((name) => !hasControlChar(name), 'name must not contain a control character');
  const createLibraryBody = z.object({
    name: libraryName,
    rootPath: z
      .string()
      .min(1)
      .max(4096)
      .refine((path) => !hasControlChar(path), 'rootPath must not contain a control character')
      .refine(isAbsolute, 'rootPath must be absolute')
      .transform((path) => underMediaRoot(deps.mediaRoot, path))
      .refine((path) => path !== null, 'rootPath must be under MEDIA_ROOT'),
    kind: z.enum(LIBRARY_KINDS),
  });
  const renameLibraryBody = z.object({ name: libraryName });

  app.post('/libraries', OWNER, async (request, reply) => {
    const body = createLibraryBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const rootPath = body.data.rootPath;
    // Spec R2: the same check as the scan, so a typo or a link out fails now, not at scan time.
    let realRootPath: string;
    try {
      realRootPath = await realRoot(rootPath, deps.mediaRoot);
    } catch (error) {
      if (!(error instanceof RootUnreadableError)) throw error;
      request.log.info(
        { event: 'library.create.refused', err: error },
        'library refused: root unreadable',
      );
      return reply.code(409).send(apiError('root_unreadable'));
    }
    // Spec R3: overlapping roots would list every title twice. Compared on real paths, as
    // the scanner walks them: a link to another library's folder overlaps it too.
    // log: n/a — a stored root gone missing is compared as written
    const real = (path: string) => realpath(path).catch(() => path);
    const realOf = new Map(
      await Promise.all(
        deps.repository.listLibraries().map(async (l) => [l.id, await real(l.rootPath)] as const),
      ),
    );
    // Re-read after the awaits and insert with none in between: two concurrent adds of the
    // same root cannot both pass. A library added meanwhile is compared on its stored path.
    const overlaps = deps.repository
      .listLibraries()
      .some((l) =>
        [l.rootPath, realOf.get(l.id) ?? l.rootPath].some(
          (other) => rootsOverlap(other, rootPath) || rootsOverlap(other, realRootPath),
        ),
      );
    if (overlaps) return reply.code(409).send(apiError('root_in_use'));
    const library: Library = deps.repository.createLibrary(body.data);
    return reply.code(201).send(library);
  });

  app.get('/libraries', async (): Promise<Library[]> => deps.repository.listLibraries());

  app.get('/libraries/folders', OWNER, async (): Promise<MediaFolderList> => {
    const libraries = deps.repository.listLibraries();
    const folders = (await listSubFolders(deps.mediaRoot)).map((folder) => ({
      ...folder,
      libraryId: libraries.find((l) => rootsOverlap(l.rootPath, folder.path))?.id ?? null,
    }));
    return { root: deps.mediaRoot, folders };
  });

  app.patch('/libraries/:id', OWNER, async (request, reply) => {
    const library = loadLibrary(request.params, deps.repository);
    if (!library.ok) return reply.code(library.status).send(library.body);
    const body = renameLibraryBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const renamed = deps.repository.renameLibrary(library.value.id, body.data.name);
    if (!renamed) return reply.code(404).send(apiError('library_not_found'));
    return reply.code(200).send(renamed);
  });

  app.delete('/libraries/:id', OWNER, async (request, reply) => {
    const library = loadLibrary(request.params, deps.repository);
    if (!library.ok) return reply.code(library.status).send(library.body);
    try {
      // Under the lock: a scan or enrichment in flight would fail mid-run on the foreign key.
      const deleted = await deps.lock.run(library.value.id, () =>
        Promise.resolve(deps.repository.deleteLibrary(library.value.id)),
      );
      if (!deleted) return reply.code(404).send(apiError('library_not_found'));
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof LibraryBusyError) return reply.code(409).send(apiError('scan_running'));
      throw error;
    }
  });

  app.post('/libraries/:id/scan', OWNER, async (request, reply) => {
    const library = loadLibrary(request.params, deps.repository);
    if (!library.ok) return reply.code(library.status).send(library.body);
    try {
      const report = await scanLibrary(deps, library.value, request.log);
      return reply.code(200).send(report);
    } catch (error) {
      if (error instanceof RootUnreadableError) {
        request.log.warn(
          { event: 'library.scan.failed', err: error, libraryId: library.value.id },
          'scan refused: root unreadable',
        );
        return reply.code(409).send(apiError('root_unreadable'));
      }
      if (error instanceof LibraryBusyError) return reply.code(409).send(apiError('scan_running'));
      throw error;
    }
  });

  app.get('/libraries/:id/media', async (request, reply) => {
    const library = loadLibrary(request.params, deps.repository);
    if (!library.ok) return reply.code(library.status).send(library.body);
    const items: Media[] = deps.repository.listMedia(library.value.id);
    return reply.code(200).send(items);
  });
}

/** Skip reasons that are a choice, not a fault (spec logging R2). */
const PLANNED_SKIPS: ReadonlySet<SkipReason> = new Set(['extra', 'duplicate']);

/**
 * UC1 with its «include» of UC2, under the library lock; shared by the scan route and the
 * schedule (spec scheduled-scan R2). The lock spans the include too: the enrichment must
 * see the rows this scan wrote.
 * @throws {LibraryBusyError} | {RootUnreadableError}
 */
export async function scanLibrary(
  deps: Pick<LibraryRoutesDeps, 'lock' | 'scanner' | 'enrich'>,
  library: Library,
  log: FastifyInstance['log'],
): Promise<ScanReport> {
  return deps.lock.run(library.id, async () => {
    const started = Date.now();
    log.info({ event: 'library.scan.start', libraryId: library.id }, 'scan started');
    const scanned = await deps.scanner.scan(library);
    // One line per file left out: ffprobe failures are only visible here (spec logging R2).
    // Extras and duplicates are left out on purpose, so they stay at debug.
    for (const file of scanned.skipped) {
      log[PLANNED_SKIPS.has(file.reason) ? 'debug' : 'warn'](
        { event: 'library.scan.skipped', libraryId: library.id, ...file },
        'file skipped',
      );
    }
    log.info(
      {
        event: 'library.scan.done',
        libraryId: library.id,
        added: scanned.added,
        updated: scanned.updated,
        removed: scanned.removed,
        skipped: scanned.skipped.length,
        ms: Date.now() - started,
      },
      'scan done',
    );
    const metadata = await includeEnrich(deps.enrich, library, log);
    return { ...scanned, metadata };
  });
}

/** The scan's «include» of UC2: a metadata failure is logged, never fails the scan (spec UC2 *a). */
async function includeEnrich(
  enrich: LibraryRoutesDeps['enrich'],
  library: Library,
  log: FastifyInstance['log'],
): Promise<EnrichReport | null> {
  if (!enrich) return null;
  try {
    return await enrich(library);
  } catch (error) {
    log.warn(
      { event: 'metadata.enrich.skipped', err: error, libraryId: library.id },
      'metadata enrichment skipped after scan',
    );
    return null;
  }
}

/** The normalised absolute path when it is the media root or under it, else null. */
function underMediaRoot(mediaRoot: string, path: string): string | null {
  const normalised = resolve(path);
  return isAtOrUnderRoot(mediaRoot, normalised) ? normalised : null;
}
