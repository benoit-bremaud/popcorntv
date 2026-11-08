import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { openDatabase } from './db/index.js';
import type { AppDatabase } from './db/index.js';
import { LibraryRepository } from './library/repository.js';
import { loggerOptions, requestLevel } from './logging.js';
import type { LogLevel } from './logging.js';
import type { Prober } from './library/ffprobe.js';
import { TEST_PUBLIC_URL, createAccount, sendCookie, testAuthOptions } from './test-fixtures.js';

type Line = Record<string, unknown>;

/** pino level numbers, to read the captured lines back. */
const LEVEL = { debug: 20, info: 30, warn: 40, error: 50 } as const;

let app: FastifyInstance | undefined;
const dirs: string[] = [];
afterEach(async () => {
  await app?.close();
  app = undefined;
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** The app with its logger writing JSON lines into `lines` (spec logging R8). */
async function loggedApp(
  level: LogLevel = 'debug',
  probe: Prober = async () => ({ durationSec: null, streams: [] }),
  mediaRoot = tmpdir(),
): Promise<{ db: AppDatabase; lines: Line[] }> {
  const db = openDatabase(':memory:');
  const lines: Line[] = [];
  app = await buildApp({
    version: '0.0.0-test',
    db,
    probe,
    mediaRoot,
    tmdb: null,
    artworkDir: tmpdir(),
    transcoder: () => {
      throw new Error('FFmpeg is not used by this suite');
    },
    transcodeDir: tmpdir(),
    ...testAuthOptions,
    logger: loggerOptions(level, { write: (line) => lines.push(JSON.parse(line) as Line) }),
  });
  return { db, lines };
}

const byEvent = (lines: readonly Line[], event: string) =>
  lines.filter((l) => l['event'] === event);

describe('requestLevel', () => {
  it.each([
    [200, false, 'info'],
    [206, true, 'debug'],
    [401, false, 'info'],
    [404, true, 'debug'],
    [404, false, 'info'],
    [502, false, 'error'],
    [503, true, 'warn'],
    [403, false, 'warn'],
    [429, true, 'warn'],
  ] as const)('logs a %i (media %s) at %s', (status, media, level) => {
    expect(requestLevel(status, media)).toBe(level);
  });
});

describe('logging', () => {
  it('writes one http.request line per answer, path without query, media at debug', async () => {
    const { lines } = await loggedApp();

    await app?.inject({ method: 'GET', url: '/health?probe=1' });

    expect(byEvent(lines, 'http.request')).toEqual([
      expect.objectContaining({ level: LEVEL.debug, method: 'GET', path: '/health', status: 200 }),
    ]);
    expect(lines.some((l) => l['msg'] === 'incoming request')).toBe(false);
  });

  it('honours the level: at info the media lines are dropped', async () => {
    const { lines } = await loggedApp('info');

    await app?.inject({ method: 'GET', url: '/health' });

    expect(byEvent(lines, 'http.request')).toEqual([]);
  });

  it('logs a cross-site refusal with its origin', async () => {
    const { lines } = await loggedApp();

    await app?.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { origin: 'https://evil.example' },
    });

    expect(byEvent(lines, 'auth.csrf_refused')).toEqual([
      expect.objectContaining({ level: LEVEL.warn, origin: 'https://evil.example' }),
    ]);
    expect(byEvent(lines, 'http.request')[0]).toMatchObject({ level: LEVEL.warn, status: 403 });
  });

  it('mirrors each audit event into the log without the username tried or any secret', async () => {
    const { db, lines } = await loggedApp();
    createAccount(db, 'alice');

    await app?.inject({
      method: 'POST',
      url: '/auth/session',
      headers: { origin: TEST_PUBLIC_URL },
      payload: { username: 'alice', password: 'wrong-password-123' },
    });

    expect(byEvent(lines, 'auth.login_failed')).toEqual([
      expect.objectContaining({ level: LEVEL.warn, ip: '127.0.0.1' }),
    ]);
    const text = JSON.stringify(lines);
    expect(text).not.toContain('wrong-password-123');
    expect(text).not.toContain('alice');
  });

  it('masks credentials whatever a call site passes', async () => {
    const { lines } = await loggedApp();

    app?.log.info({ headers: { cookie: 'pctv_session=abc', authorization: 'Bearer xyz' } }, 'x');

    expect(JSON.stringify(lines)).not.toMatch(/abc|xyz/);
    expect(lines.at(-1)).toMatchObject({ headers: { cookie: '[redacted]' } });
  });

  it('logs the start, a probe failure at warn, an extra at debug and the totals of a scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'popcorntv-logging-'));
    dirs.push(root);
    await writeFile(join(root, 'Broken (2020).mkv'), 'x');
    await writeFile(join(root, 'Heat (1995)-trailer.mkv'), 'x');
    const { db, lines } = await loggedApp(
      'debug',
      async () => {
        throw new Error('moov atom not found');
      },
      root,
    );
    sendCookie(app as FastifyInstance, createAccount(db).cookie);
    const library = new LibraryRepository(db).createLibrary({
      name: 'Films',
      rootPath: root,
      kind: 'films',
    });

    await app?.inject({
      method: 'POST',
      url: `/libraries/${library.id}/scan`,
      headers: { origin: TEST_PUBLIC_URL },
    });

    expect(byEvent(lines, 'library.scan.start')).toHaveLength(1);
    expect(byEvent(lines, 'library.scan.skipped')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: LEVEL.warn, reason: 'probe_failed' }),
        expect.objectContaining({ level: LEVEL.debug, reason: 'extra' }),
      ]),
    );
    expect(byEvent(lines, 'library.scan.done')).toEqual([
      expect.objectContaining({ level: LEVEL.info, libraryId: library.id, skipped: 2 }),
    ]);
  });

  it('logs a scan refused for an unreadable root', async () => {
    const { db, lines } = await loggedApp();
    sendCookie(app as FastifyInstance, createAccount(db).cookie);
    const library = new LibraryRepository(db).createLibrary({
      name: 'Gone',
      rootPath: join(tmpdir(), 'popcorntv-no-such-folder'),
      kind: 'films',
    });

    await app?.inject({
      method: 'POST',
      url: `/libraries/${library.id}/scan`,
      headers: { origin: TEST_PUBLIC_URL },
    });

    expect(byEvent(lines, 'library.scan.failed')).toEqual([
      expect.objectContaining({ level: LEVEL.warn, libraryId: library.id }),
    ]);
  });

  it("keeps Fastify's error line when a stream fails after the headers", async () => {
    const { lines } = await loggedApp();
    app?.get('/broken-stream', { config: { access: 'public' } }, (_request, reply) => {
      const body = new Readable({
        read() {
          this.push('partial');
          this.destroy(new Error('EIO disk read'));
        },
      });
      return reply.type('application/octet-stream').send(body);
    });

    await app?.inject({ method: 'GET', url: '/broken-stream' }).catch(() => undefined);

    await vi.waitFor(() => expect(JSON.stringify(lines)).toContain('EIO disk read'));
  });
});
