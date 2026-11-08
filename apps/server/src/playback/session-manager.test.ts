import { writeFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import type { StreamInfo } from '@popcorntv/shared';
import { SessionManager } from './session-manager.js';
import type { SessionManagerOptions } from './session-manager.js';
import type { ExitListener, Transcoder } from './transcoder.js';

/** Opener of the sessions these tests open, unless a test names another one. */
const USER = { userId: 'user-1', role: 'owner' } as const;
const VIEWER = { userId: 'viewer-1', role: 'viewer' } as const;
const OTHER_VIEWER = { userId: 'viewer-2', role: 'viewer' } as const;
const OTHER_OWNER = { userId: 'owner-2', role: 'owner' } as const;

const HEVC: readonly StreamInfo[] = [
  { type: 'video', codec: 'hevc', width: 3840, height: 2160, language: null },
];

/** A transcoder double: records each run, optionally writes the playlist like FFmpeg. */
function fakeTranscoder(behaviour: 'writes' | 'silent' | 'crashes') {
  const kills = vi.fn();
  const runs: { args: readonly string[]; onExit: ExitListener }[] = [];
  const transcoder: Transcoder = (args, onExit) => {
    runs.push({ args, onExit });
    const playlist = args.at(-1) ?? '';
    if (behaviour === 'writes') writeFileSync(playlist, '#EXTM3U\n');
    if (behaviour === 'crashes') queueMicrotask(() => onExit(1, 'Invalid data found'));
    return { kill: kills };
  };
  return { transcoder, kills, runs };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe('SessionManager', () => {
  let dir: string;
  let warn: ReturnType<typeof vi.fn>;
  let info: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'popcorntv-sessions-')), 'transcode');
    warn = vi.fn();
    info = vi.fn();
  });

  afterEach(async () => {
    await rm(dirname(dir), { recursive: true, force: true });
  });

  function manager(transcoder: Transcoder, overrides: Partial<SessionManagerOptions> = {}) {
    return new SessionManager({
      transcoder,
      dir,
      maxSessions: 1,
      logger: { warn, info, debug: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger,
      pollMs: 5,
      ...overrides,
    });
  }

  it('opens a session once FFmpeg has written the playlist, in its own directory', async () => {
    const { transcoder, runs } = fakeTranscoder('writes');
    const sessions = manager(transcoder);

    const result = await sessions.open(USER, '/m/a.mkv', HEVC);

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    const playlist = sessions.filePath(result.id, 'index.m3u8') ?? '';
    expect(await exists(playlist)).toBe(true);
    expect(runs[0]?.args).toContain('/m/a.mkv');
    expect(dirname(playlist).startsWith(join(dir, 'session-'))).toBe(true);
    await sessions.closeAll();
  });

  it('answers busy to a viewer at the limit, and frees the slot on close', async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder);
    const first = await sessions.open(VIEWER, '/m/a.mkv', HEVC);

    expect((await sessions.open(OTHER_VIEWER, '/m/b.mkv', HEVC)).kind).toBe('busy');
    if (first.kind === 'ready') await sessions.close(first.id);
    expect((await sessions.open(OTHER_VIEWER, '/m/b.mkv', HEVC)).kind).toBe('ready');
    await sessions.closeAll();
  });

  it("takes over the opener's own session at the limit", async () => {
    const { transcoder, kills } = fakeTranscoder('writes');
    const sessions = manager(transcoder);
    const first = await sessions.open(VIEWER, '/m/a.mkv', HEVC);

    const second = await sessions.open(VIEWER, '/m/b.mkv', HEVC);

    expect(second.kind).toBe('ready');
    if (first.kind !== 'ready') return;
    expect(sessions.touch(first.id)).toBe(false);
    expect(kills).toHaveBeenCalledOnce();
    await sessions.closeAll();
  });

  it("lets an owner take over the oldest viewer session, not another owner's", async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder, { maxSessions: 2 });
    const owner = await sessions.open(OTHER_OWNER, '/m/b.mkv', HEVC);
    const viewer = await sessions.open(VIEWER, '/m/a.mkv', HEVC);

    expect((await sessions.open(USER, '/m/c.mkv', HEVC)).kind).toBe('ready');
    if (viewer.kind !== 'ready' || owner.kind !== 'ready') return;
    expect(sessions.touch(viewer.id)).toBe(false);
    expect(sessions.touch(owner.id)).toBe(true);
    expect((await sessions.open(OTHER_VIEWER, '/m/d.mkv', HEVC)).kind).toBe('busy');
    await sessions.closeAll();
  });

  it("takes over an owner's own session before a viewer's, and the oldest first", async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder, { maxSessions: 3 });
    const viewer = await sessions.open(VIEWER, '/m/a.mkv', HEVC);
    const older = await sessions.open(USER, '/m/b.mkv', HEVC);
    const newer = await sessions.open(USER, '/m/c.mkv', HEVC);

    expect((await sessions.open(USER, '/m/d.mkv', HEVC)).kind).toBe('ready');
    if (viewer.kind !== 'ready' || older.kind !== 'ready' || newer.kind !== 'ready') return;
    expect(sessions.touch(viewer.id)).toBe(true);
    expect(sessions.touch(older.id)).toBe(false);
    expect(sessions.touch(newer.id)).toBe(true);
    expect(await readdir(dir)).toHaveLength(3);
    await sessions.closeAll();
  });

  it('takes nothing over for a title without video at the limit', async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder);
    const viewer = await sessions.open(VIEWER, '/m/a.mkv', HEVC);

    const audio = await sessions.open(USER, '/m/b.mka', [
      { type: 'audio', codec: 'ac3', width: null, height: null, language: null },
    ]);

    expect(audio.kind).toBe('not_playable');
    if (viewer.kind === 'ready') expect(sessions.touch(viewer.id)).toBe(true);
    await sessions.closeAll();
  });

  it('fails an open taken over while its playlist check is in flight', async () => {
    const { transcoder: writes } = fakeTranscoder('writes');
    let takeover: Promise<unknown> = Promise.resolve();
    const sessions: SessionManager = manager((args, onExit) => {
      const handle = writes(args, onExit);
      // Runs before the pending `access` of the victim's playlist resolves.
      if (args.includes('/m/a.mkv')) {
        queueMicrotask(() => {
          takeover = sessions.open(USER, '/m/b.mkv', HEVC);
        });
      }
      return handle;
    });

    const victim = await sessions.open(VIEWER, '/m/a.mkv', HEVC);

    expect(victim.kind).toBe('failed');
    expect(await takeover).toMatchObject({ kind: 'ready' });
    await sessions.closeAll();
  });

  it("answers busy to a viewer when the slot is an owner's", async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder);
    await sessions.open(USER, '/m/a.mkv', HEVC);

    expect((await sessions.open(VIEWER, '/m/b.mkv', HEVC)).kind).toBe('busy');
    await sessions.closeAll();
  });

  it('answers busy to an owner when every slot belongs to another owner', async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder);
    await sessions.open(OTHER_OWNER, '/m/a.mkv', HEVC);

    expect((await sessions.open(USER, '/m/b.mkv', HEVC)).kind).toBe('busy');
    await sessions.closeAll();
  });

  it('fails the open of a session taken over before its playlist exists', async () => {
    const { transcoder, runs, kills } = fakeTranscoder('silent');
    const sessions = manager(transcoder, { readyTimeoutMs: 1_000 });
    const pending = sessions.open(VIEWER, '/m/a.mkv', HEVC);
    // The session joins the map in the same tick FFmpeg is spawned.
    await vi.waitFor(() => expect(runs).toHaveLength(1));

    const owner = sessions.open(USER, '/m/b.mkv', HEVC);

    expect((await pending).kind).toBe('failed');
    expect(kills).toHaveBeenCalledOnce();
    await sessions.closeAll();
    expect((await owner).kind).toBe('failed');
  });

  it('fails and cleans up when FFmpeg exits before writing the playlist', async () => {
    const { transcoder, kills } = fakeTranscoder('crashes');
    const sessions = manager(transcoder);

    expect((await sessions.open(USER, '/m/a.mkv', HEVC)).kind).toBe('failed');
    expect(kills).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => expect(await readdir(dir)).toEqual([]));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 1, stderrTail: 'Invalid data found' }),
      'ffmpeg failed',
    );
  });

  it('fails when no playlist appears before the ready timeout', async () => {
    const sessions = manager(fakeTranscoder('silent').transcoder, { readyTimeoutMs: 30 });

    expect((await sessions.open(USER, '/m/a.mkv', HEVC)).kind).toBe('failed');
    expect(await readdir(dir)).toEqual([]);
  });

  it('refuses a file without video before spawning anything', async () => {
    const { transcoder, runs } = fakeTranscoder('writes');
    const sessions = manager(transcoder);

    const result = await sessions.open(USER, '/m/a.mka', [
      { type: 'audio', codec: 'aac', width: null, height: null, language: null },
    ]);

    expect(result.kind).toBe('not_playable');
    expect(runs).toHaveLength(0);
    expect(await exists(dir)).toBe(false);
  });

  it('closes a session after the idle delay, unless touched', async () => {
    const { transcoder, kills } = fakeTranscoder('writes');
    const sessions = manager(transcoder, { idleMs: 60_000 });
    let id = '';
    // Only the global timers are faked: `open` polls with `timers/promises`, left real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    try {
      const result = await sessions.open(USER, '/m/a.mkv', HEVC);
      if (result.kind !== 'ready') throw new Error('not ready');
      id = result.id;
      await vi.advanceTimersByTimeAsync(50_000);
      expect(sessions.touch(id)).toBe(true);
      await vi.advanceTimersByTimeAsync(50_000);
      expect(sessions.touch(id)).toBe(true);
      await vi.advanceTimersByTimeAsync(60_000);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(async () => expect(await readdir(dir)).toEqual([]));

    expect(sessions.touch(id)).toBe(false);
    expect(kills).toHaveBeenCalledTimes(1);
  });

  it('only resolves the names FFmpeg writes', async () => {
    const sessions = manager(fakeTranscoder('writes').transcoder);
    const result = await sessions.open(USER, '/m/a.mkv', HEVC);
    if (result.kind !== 'ready') throw new Error('not ready');

    expect(sessions.filePath(result.id, 'segment-00003.ts')).toMatch(/segment-00003\.ts$/);
    expect(sessions.filePath(result.id, '../../etc/passwd')).toBeNull();
    expect(sessions.filePath(result.id, 'index.m3u8.tmp')).toBeNull();
    expect(sessions.filePath('unknown', 'index.m3u8')).toBeNull();
    await sessions.closeAll();
  });

  it('lets only one of two concurrent opens take the single slot', async () => {
    const { transcoder, runs } = fakeTranscoder('writes');
    const sessions = manager(transcoder);

    const results = await Promise.all([
      sessions.open(USER, '/m/a.mkv', HEVC),
      sessions.open(USER, '/m/b.mkv', HEVC),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(['busy', 'ready']);
    expect(runs).toHaveLength(1);
    await sessions.closeAll();
  });

  it('closes a ready session whose FFmpeg crashes, freeing the slot', async () => {
    const { transcoder, runs, kills } = fakeTranscoder('writes');
    const sessions = manager(transcoder);
    const result = await sessions.open(USER, '/m/a.mkv', HEVC);
    if (result.kind !== 'ready') throw new Error('not ready');

    runs[0]?.onExit(1, 'Conversion failed');

    expect(sessions.touch(result.id)).toBe(false);
    expect(kills).toHaveBeenCalledOnce();
    await vi.waitFor(async () => expect(await readdir(dir)).toEqual([]));
    expect(warn).toHaveBeenCalledOnce();
  });

  it('logs the opening and the reason each session closed', async () => {
    const { transcoder } = fakeTranscoder('writes');
    const sessions = manager(transcoder, { idleMs: 20 });
    const result = await sessions.open(USER, '/m/a.mkv', HEVC, 12);
    if (result.kind !== 'ready') throw new Error('not ready');

    await vi.waitFor(() =>
      expect(info).toHaveBeenCalledWith(
        { event: 'playback.session.closed', session: result.id, reason: 'idle' },
        'transcode session closed',
      ),
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'playback.session.opened',
        session: result.id,
        startSec: 12,
      }),
      'transcode session opened',
    );
  });

  it('logs nothing when its own close kills FFmpeg', async () => {
    const { transcoder, runs } = fakeTranscoder('writes');
    const sessions = manager(transcoder);
    const result = await sessions.open(USER, '/m/a.mkv', HEVC);
    if (result.kind !== 'ready') throw new Error('not ready');

    await sessions.close(result.id);
    runs[0]?.onExit(null, '');

    expect(warn).not.toHaveBeenCalled();
  });

  it('fails cleanly when FFmpeg cannot even be spawned', async () => {
    const error = vi.fn();
    const sessions = new SessionManager({
      transcoder: () => {
        throw new Error('EAGAIN');
      },
      dir,
      maxSessions: 1,
      logger: { warn, error, info } as unknown as FastifyBaseLogger,
    });

    expect((await sessions.open(USER, '/m/a.mkv', HEVC)).kind).toBe('failed');
    expect(await readdir(dir)).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('cleans only the session directories a previous run left', async () => {
    await mkdir(join(dir, 'session-a1B2c3'), { recursive: true });
    writeFileSync(join(dir, 'session-a1B2c3', 'index.m3u8'), '');
    writeFileSync(join(dir, 'session-a1B2c3', 'segment-00000.ts.tmp'), '');
    await mkdir(join(dir, 'keep-me'));
    await mkdir(join(dir, 'session-notes'));
    await mkdir(join(dir, 'session-x9y8z7'));
    writeFileSync(join(dir, 'session-x9y8z7', 'thesis.docx'), '');
    writeFileSync(join(dir, 'session-f0f0f0'), 'a file, not a directory');
    const sessions = manager(fakeTranscoder('writes').transcoder);

    await sessions.clean();

    expect((await readdir(dir)).sort()).toEqual([
      'keep-me',
      'session-f0f0f0',
      'session-notes',
      'session-x9y8z7',
    ]);
  });

  it('cleans nothing when the directory does not exist yet', async () => {
    await expect(manager(fakeTranscoder('writes').transcoder).clean()).resolves.toBeUndefined();
  });

  it('reports a second close as already gone', async () => {
    const { transcoder, kills } = fakeTranscoder('writes');
    const sessions = manager(transcoder);
    const result = await sessions.open(USER, '/m/a.mkv', HEVC);
    if (result.kind !== 'ready') throw new Error('not ready');

    expect(await sessions.close(result.id)).toBe(true);
    expect(await sessions.close(result.id)).toBe(false);
    expect(kills).toHaveBeenCalledTimes(1);
  });
});
