import { access, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { ApiError, Library } from '@popcorntv/shared';
import { buildApp } from '../app.js';
import { openDatabase } from '../db/index.js';
import type { Prober } from './ffprobe.js';
import { createAccount, sendCookie, testAuthOptions } from '../test-fixtures.js';

describe('library routes', () => {
  let app: FastifyInstance;
  let mediaRoot: string;
  let root: string;
  let probe: ReturnType<typeof vi.fn<Prober>>;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'popcorntv-routes-'));
    root = join(mediaRoot, 'films');
    await mkdir(root);
    probe = vi.fn<Prober>(async () => ({ durationSec: 60, streams: [] }));
    const db = openDatabase(':memory:');
    app = await buildApp({
      version: 'test',
      db,
      probe,
      mediaRoot,
      tmdb: null,
      artworkDir: join(mediaRoot, 'artwork'),
      transcoder: () => {
        throw new Error('FFmpeg is not used by this suite');
      },
      transcodeDir: tmpdir(),
      ...testAuthOptions,
    });
    sendCookie(app, createAccount(db).cookie);
  });

  afterEach(async () => {
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  async function createLibrary(rootPath = root): Promise<Library> {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: 'Films', rootPath, kind: 'films' },
    });
    expect(response.statusCode).toBe(201);
    return response.json<Library>();
  }

  it('creates and lists libraries', async () => {
    const library = await createLibrary();

    const list = await app.inject({ method: 'GET', url: '/libraries' });

    expect(library).toMatchObject({ name: 'Films', rootPath: root, kind: 'films' });
    expect(list.json()).toEqual([library]);
  });

  it('accepts the media root itself and normalises the path', async () => {
    const library = await createLibrary(`${mediaRoot}/films/../`);

    expect(library.rootPath).toBe(mediaRoot);
  });

  it('rejects an invalid body with the path and message of each issue only', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: '', rootPath: 'relative/path', kind: 'music' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; details: { path: string[]; message: string }[] }>();
    expect(body.error).toBe('invalid_request');
    expect(body.details.map((issue) => issue.path[0]).sort()).toEqual(['kind', 'name', 'rootPath']);
    expect(Object.keys(body.details[0] ?? {}).sort()).toEqual(['message', 'path']);
  });

  it('rejects a root outside MEDIA_ROOT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/libraries',
      payload: { name: 'Etc', rootPath: '/etc', kind: 'films' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().details).toEqual([
      { path: ['rootPath'], message: 'rootPath must be under MEDIA_ROOT' },
    ]);
  });

  it('scans a library and lists its media with relative paths', async () => {
    const library = await createLibrary();
    await writeFile(join(root, 'Heat (1995).mkv'), 'x');

    const scan = await app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });
    const media = await app.inject({ method: 'GET', url: `/libraries/${library.id}/media` });

    expect(scan.statusCode).toBe(200);
    expect(scan.json()).toEqual({ added: 1, updated: 0, removed: 0, skipped: [], metadata: null });
    expect(media.json()).toEqual([
      expect.objectContaining({
        title: 'Heat',
        year: 1995,
        relativePath: 'Heat (1995).mkv',
        durationSec: 60,
        streams: [],
      }),
    ]);
    expect(media.body).not.toContain(mediaRoot);
  });

  it.each([
    ['POST', 'scan'],
    ['GET', 'media'],
  ] as const)('%s /libraries/:id/%s answers 404 for an unknown library', async (method, action) => {
    const response = await app.inject({
      method,
      url: `/libraries/${crypto.randomUUID()}/${action}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'library_not_found' });
  });

  it.each([
    ['POST', 'scan'],
    ['GET', 'media'],
  ] as const)('%s /libraries/:id/%s answers 400 for a malformed id', async (method, action) => {
    const response = await app.inject({ method, url: `/libraries/not-a-uuid/${action}` });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiError>().error).toBe('invalid_request');
  });

  it('answers 409 when the root cannot be read', async () => {
    const library = await createLibrary(join(root, 'missing'));

    const scan = await app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });

    expect(scan.statusCode).toBe(409);
    expect(scan.json()).toEqual({ error: 'root_unreadable' });
  });

  it('answers 409 while a scan of the same library is running', async () => {
    const library = await createLibrary();
    await writeFile(join(root, 'Heat (1995).mkv'), 'x');
    let release: () => void = () => undefined;
    probe.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ durationSec: 1, streams: [] }))),
    );

    const first = app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });
    await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    const second = await app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });
    release();

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'scan_running' });
    expect((await first).statusCode).toBe(200);
  });

  describe('management (spec library-management)', () => {
    it.each([
      ['the same root', () => root],
      ['a root inside it', () => join(root, 'sub')],
      ['a root containing it', () => mediaRoot],
    ])('refuses %s with 409 root_in_use', async (_label, other) => {
      await createLibrary();

      const response = await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: 'Again', rootPath: other(), kind: 'series' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'root_in_use' });
    });

    it('refuses a link to another library root with 409 root_in_use', async () => {
      await createLibrary();
      await symlink(root, join(mediaRoot, 'films-link'));

      const response = await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: 'Link', rootPath: join(mediaRoot, 'films-link'), kind: 'films' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'root_in_use' });
    });

    it('accepts a sibling root that shares a name prefix', async () => {
      await createLibrary();
      await mkdir(join(mediaRoot, 'films-old'));

      const response = await app.inject({
        method: 'POST',
        url: '/libraries',
        payload: { name: 'Old', rootPath: join(mediaRoot, 'films-old'), kind: 'films' },
      });

      expect(response.statusCode).toBe(201);
    });

    it('lists the direct sub-folders of MEDIA_ROOT without links, files or hidden folders', async () => {
      const library = await createLibrary();
      await mkdir(join(mediaRoot, 'series'));
      await mkdir(join(mediaRoot, '.trash'));
      await mkdir(join(root, 'nested'));
      await writeFile(join(mediaRoot, 'readme.txt'), 'x');
      await symlink('/etc', join(mediaRoot, 'etc-link'));

      const response = await app.inject({ method: 'GET', url: '/libraries/folders' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        root: mediaRoot,
        folders: [
          { name: 'films', path: root, libraryId: library.id },
          { name: 'series', path: join(mediaRoot, 'series'), libraryId: null },
        ],
      });
    });

    it('marks every folder as taken when a library is rooted at MEDIA_ROOT', async () => {
      const library = await createLibrary(mediaRoot);

      const response = await app.inject({ method: 'GET', url: '/libraries/folders' });

      expect(response.json<{ folders: { libraryId: string | null }[] }>().folders).toEqual([
        expect.objectContaining({ libraryId: library.id }),
      ]);
    });

    it('answers an empty folder list when MEDIA_ROOT cannot be read', async () => {
      await rm(mediaRoot, { recursive: true, force: true });

      const response = await app.inject({ method: 'GET', url: '/libraries/folders' });

      expect(response.json()).toEqual({ root: mediaRoot, folders: [] });
    });

    it('renames a library and keeps its kind and root', async () => {
      const library = await createLibrary();

      const response = await app.inject({
        method: 'PATCH',
        url: `/libraries/${library.id}`,
        payload: { name: '  Movies  ', kind: 'series', rootPath: '/etc' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...library, name: 'Movies' });
    });

    it('rejects an empty name', async () => {
      const library = await createLibrary();

      const response = await app.inject({
        method: 'PATCH',
        url: `/libraries/${library.id}`,
        payload: { name: ' ' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error).toBe('invalid_request');
    });

    it('deletes a library with its media', async () => {
      const library = await createLibrary();
      await writeFile(join(root, 'Heat (1995).mkv'), 'x');
      await app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });

      const deleted = await app.inject({ method: 'DELETE', url: `/libraries/${library.id}` });
      const list = await app.inject({ method: 'GET', url: '/libraries' });
      const media = await app.inject({ method: 'GET', url: `/libraries/${library.id}/media` });

      expect(deleted.statusCode).toBe(204);
      expect(list.json()).toEqual([]);
      expect(media.statusCode).toBe(404);
      // The files themselves are never touched.
      await expect(access(join(root, 'Heat (1995).mkv'))).resolves.toBeUndefined();
    });

    it.each(['PATCH', 'DELETE'] as const)(
      '%s answers 404 for an unknown library',
      async (method) => {
        const response = await app.inject({
          method,
          url: `/libraries/${crypto.randomUUID()}`,
          payload: { name: 'X' },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: 'library_not_found' });
      },
    );

    it('refuses to delete a library while it is being scanned', async () => {
      const library = await createLibrary();
      await writeFile(join(root, 'Heat (1995).mkv'), 'x');
      let release: () => void = () => undefined;
      probe.mockImplementationOnce(
        () => new Promise((resolve) => (release = () => resolve({ durationSec: 1, streams: [] }))),
      );

      const scan = app.inject({ method: 'POST', url: `/libraries/${library.id}/scan` });
      await vi.waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
      let deleted;
      try {
        deleted = await app.inject({ method: 'DELETE', url: `/libraries/${library.id}` });
      } finally {
        release();
      }

      expect(deleted.statusCode).toBe(409);
      expect(deleted.json()).toEqual({ error: 'scan_running' });
      expect((await scan).statusCode).toBe(200);
    });

    it('scans when sent an empty JSON body (#122)', async () => {
      const library = await createLibrary();

      const scan = await app.inject({
        method: 'POST',
        url: `/libraries/${library.id}/scan`,
        headers: { 'content-type': 'application/json' },
        payload: '',
      });

      expect(scan.statusCode).toBe(200);
    });

    it('still rejects a malformed JSON body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/libraries',
        headers: { 'content-type': 'application/json' },
        payload: '{"name":',
      });

      expect(response.statusCode).toBe(400);
    });

    it('still rejects a prototype-poisoning JSON body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/libraries',
        headers: { 'content-type': 'application/json' },
        payload: '{"__proto__":{"x":1}}',
      });
      const list = await app.inject({ method: 'GET', url: '/libraries' });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiError>().error).toBe('invalid_request');
      expect(list.json()).toEqual([]);
    });
  });
});
