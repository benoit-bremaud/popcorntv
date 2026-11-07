import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LIBRARY_KINDS } from '@popcorntv/shared';
import type { EnrichReport, Library, Media, MediaFolderList, ScanReport } from '@popcorntv/shared';
import { apiError, invalid, loadLibrary } from '../http.js';
import { listSubFolders } from './folder-lister.js';
import { LibraryBusyError } from './lock.js';
import type { LibraryLock } from './lock.js';
import { isAtOrUnderRoot, rootsOverlap } from './path-guard.js';
import type { LibraryRepository } from './repository.js';
import { RootUnreadableError } from './scanner.js';
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
 * `POST /libraries` (201 | 400 `invalid_request` | 409 `root_in_use`), `GET /libraries`,
 * `GET /libraries/folders`, `PATCH /libraries/:id` (200 | 400 | 404),
 * `DELETE /libraries/:id` (204 | 400 | 404 | 409 `scan_running`),
 * `POST /libraries/:id/scan` (200 | 400 | 404 `library_not_found` | 409 `root_unreadable` /
 * `scan_running` — a scan *or an enrichment* of the library is in flight),
 * `GET /libraries/:id/media` (200 | 400 | 404).
 */
export function registerLibraryRoutes(app: FastifyInstance, deps: LibraryRoutesDeps): void {
  const createLibraryBody = z.object({
    name: z.string().trim().min(1).max(200),
    rootPath: z
      .string()
      .min(1)
      .max(4096)
      .refine(isAbsolute, 'rootPath must be absolute')
      .transform((path) => underMediaRoot(deps.mediaRoot, path))
      .refine((path) => path !== null, 'rootPath must be under MEDIA_ROOT'),
    kind: z.enum(LIBRARY_KINDS),
  });
  const renameLibraryBody = z.object({ name: z.string().trim().min(1).max(200) });

  app.post('/libraries', OWNER, async (request, reply) => {
    const body = createLibraryBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send(invalid(body.error.issues));
    const rootPath = body.data.rootPath;
    // Spec R3: overlapping roots would list every title twice. Compared on real paths, as
    // the scanner walks them: a link to another library's folder overlaps it too.
    const real = (path: string) => realpath(path).catch(() => path);
    const realRoot = await real(rootPath);
    const others = await Promise.all(deps.repository.listLibraries().map((l) => real(l.rootPath)));
    if (others.some((other) => rootsOverlap(other, rootPath) || rootsOverlap(other, realRoot)))
      return reply.code(409).send(apiError('root_in_use'));
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
      const deleted = await deps.lock.run(library.value.id, async () =>
        deps.repository.deleteLibrary(library.value.id),
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
      // The lock spans the include too: the enrichment must see the rows this scan wrote.
      const report: ScanReport = await deps.lock.run(library.value.id, async () => {
        const scanned = await deps.scanner.scan(library.value);
        const metadata = await includeEnrich(deps.enrich, library.value, request.log);
        return { ...scanned, metadata };
      });
      return reply.code(200).send(report);
    } catch (error) {
      if (error instanceof RootUnreadableError)
        return reply.code(409).send(apiError('root_unreadable'));
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
    log.warn(error, 'metadata enrichment skipped after scan');
    return null;
  }
}

/** The normalised absolute path when it is the media root or under it, else null. */
function underMediaRoot(mediaRoot: string, path: string): string | null {
  const normalised = resolve(path);
  return isAtOrUnderRoot(mediaRoot, normalised) ? normalised : null;
}
