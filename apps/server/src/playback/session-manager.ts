import { randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyBaseLogger } from 'fastify';
import type { Role, StreamInfo } from '@popcorntv/shared';
import type { Caller } from '../http.js';
import { PLAYLIST_NAME, SEGMENT_PATTERN, ffmpegArgs } from './ffmpeg-args.js';
import type { TranscodeHandle, Transcoder } from './transcoder.js';

/** Tunables of the session lifecycle (state diagram 05); tests shorten them. */
export interface SessionManagerOptions {
  readonly transcoder: Transcoder;
  /** Parent of every session directory (`TRANSCODE_DIR`). */
  readonly dir: string;
  /** `TRANSCODE_MAX_SESSIONS`: at it `open` frees a slot or answers `busy` (spec R5, R5b). */
  readonly maxSessions: number;
  readonly logger: FastifyBaseLogger;
  /** Without any request for this long the session is closed (spec R4). */
  readonly idleMs?: number;
  /** FFmpeg must write the playlist within this delay (spec 3d). */
  readonly readyTimeoutMs?: number;
  readonly pollMs?: number;
}

/** The user opening a session: the slot rule (spec R5b) depends on the role. */
export type Opener = Pick<Caller, 'userId' | 'role'>;

/**
 * Outcome of `open`: `busy` when `maxSessions` are running and none may be taken over,
 * `failed` when FFmpeg exits, writes no playlist within `readyTimeoutMs` or the session is
 * taken over meanwhile, `not_playable` without a video stream.
 */
export type OpenResult =
  | { readonly kind: 'ready'; readonly id: string }
  | { readonly kind: 'not_playable' | 'busy' | 'failed' };

interface Session {
  /**
   * The user who opened it: nobody else may read or close it through the routes (spec auth
   * R10); an owner's Play may still take its slot (spec hls-transcode R5b).
   */
  readonly owner: string;
  readonly role: Role;
  readonly dir: string;
  readonly handle: TranscodeHandle;
  readonly timer: NodeJS.Timeout;
}

/** Directory names `open` creates under `dir`; `clean` removes only these. */
const SESSION_PREFIX = 'session-';
/** `mkdtemp` appends six random characters to the prefix. */
const SESSION_DIR = /^session-[\w-]{6}$/;

const IDLE_MS = 60_000;
const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 200;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * In-memory HLS sessions (ADR-0006 §3): one FFmpeg process and one private temp
 * directory each, closed on demand, after `idleMs` without `touch`, or by `closeAll`.
 */
export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  /** Opens past the limit check but not yet in `sessions` (between their awaits). */
  private starting = 0;
  private readonly idleMs: number;
  private readonly readyTimeoutMs: number;
  private readonly pollMs: number;

  constructor(private readonly options: SessionManagerOptions) {
    this.idleMs = options.idleMs ?? IDLE_MS;
    this.readyTimeoutMs = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
    this.pollMs = options.pollMs ?? POLL_MS;
  }

  /**
   * Starts FFmpeg on a confined real path and resolves once its playlist exists. Creates
   * one directory under `dir`, removed again on every failure path. `startSec` (media
   * seconds, 0 = from the start) is the resume offset (ADR-0007 §2); the routes never pass
   * one at or past the end of the file. At the limit, the slot of `opener`'s own oldest
   * session is taken over, else, for an owner, the oldest viewer session (spec R5b).
   */
  async open(
    opener: Opener,
    inputPath: string,
    streams: readonly StreamInfo[],
    startSec = 0,
  ): Promise<OpenResult> {
    // Known before any take-over: a title without video must not end someone's stream.
    if (!streams.some((stream) => stream.type === 'video')) return { kind: 'not_playable' };
    let preempted: Promise<boolean> | undefined;
    if (this.sessions.size + this.starting >= this.options.maxSessions) {
      const victim = this.victimFor(opener);
      if (victim === undefined) return { kind: 'busy' };
      const { owner, role } = this.sessions.get(victim) ?? {};
      this.options.logger.info(
        { session: victim, victimOwner: owner, victimRole: role, by: opener.userId },
        'session taken over',
      );
      // `close` forgets the session synchronously: the slot is free before any await.
      preempted = this.close(victim);
    }
    // Reserved before the first await (nothing is awaited since the check), so concurrent
    // opens cannot both pass the limit.
    this.starting += 1;
    let dir: string;
    try {
      await preempted;
      await mkdir(this.options.dir, { recursive: true });
      dir = await mkdtemp(join(this.options.dir, SESSION_PREFIX));
    } finally {
      this.starting -= 1;
    }
    const args = ffmpegArgs(inputPath, streams, dir, startSec);
    if (args === null) {
      await this.remove(dir);
      return { kind: 'not_playable' };
    }
    const id = randomUUID();
    let exited = false;
    let handle: TranscodeHandle;
    try {
      handle = this.options.transcoder(args, (code, stderrTail) => {
        exited = true;
        // `close` forgets the session before killing it: only a crash is still in the map.
        if (code === 0 || !this.sessions.has(id)) return;
        this.options.logger.warn({ session: id, code, stderrTail }, 'ffmpeg failed');
        // A crashed transcode must not hold the slot until the viewer gives up.
        void this.close(id);
      });
    } catch (error) {
      this.options.logger.error({ err: error }, 'ffmpeg could not start');
      await this.remove(dir);
      return { kind: 'failed' };
    }
    const timer = setTimeout(() => void this.close(id), this.idleMs);
    this.sessions.set(id, { owner: opener.userId, role: opener.role, dir, handle, timer });

    const deadline = Date.now() + this.readyTimeoutMs;
    const playlist = join(dir, PLAYLIST_NAME);
    const waitForPlaylist = async (): Promise<boolean> => {
      // A take-over may land while `exists` is in flight: only a live session is ready.
      if (await exists(playlist)) return this.sessions.has(id);
      if (exited || Date.now() >= deadline || !this.sessions.has(id)) return false;
      await delay(this.pollMs);
      return waitForPlaylist();
    };
    if (await waitForPlaylist()) return { kind: 'ready', id };
    await this.close(id);
    return { kind: 'failed' };
  }

  /**
   * The session whose slot `opener` may take at the limit (spec R5b): their own oldest, else
   * for an owner the oldest viewer one; `sessions` iterates in insertion order.
   */
  private victimFor(opener: Opener): string | undefined {
    const entries = [...this.sessions];
    const own = entries.find(([, session]) => session.owner === opener.userId);
    if (own !== undefined) return own[0];
    if (opener.role !== 'owner') return undefined;
    return entries.find(([, session]) => session.role === 'viewer')?.[0];
  }

  /** True when the session is live and was opened by `userId`; another user's reads as unknown. */
  ownedBy(id: string, userId: string): boolean {
    return this.sessions.get(id)?.owner === userId;
  }

  /** Resets the idle timer; false for an unknown or closed session. */
  touch(id: string): boolean {
    const session = this.sessions.get(id);
    session?.timer.refresh();
    return session !== undefined;
  }

  /**
   * Absolute path of a playlist or segment of the session, or null when the name is not
   * one FFmpeg writes: no path is ever built from an unchecked URL segment.
   */
  filePath(id: string, name: string): string | null {
    const session = this.sessions.get(id);
    if (session === undefined) return null;
    if (name !== PLAYLIST_NAME && !SEGMENT_PATTERN.test(name)) return null;
    return join(session.dir, name);
  }

  /** Kills FFmpeg and removes the directory; false when the session was already gone. */
  async close(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (session === undefined) return false;
    this.sessions.delete(id);
    clearTimeout(session.timer);
    session.handle.kill();
    await this.remove(session.dir);
    return true;
  }

  /**
   * Removes leftovers of a previous run: only directories named like `mkdtemp` made them
   * and holding nothing but FFmpeg output, so a misconfigured `TRANSCODE_DIR` never
   * wipes anything else.
   */
  async clean(): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.options.dir, { withFileTypes: true });
    } catch {
      return;
    }
    const candidates = entries.filter(
      (entry) => entry.isDirectory() && SESSION_DIR.test(entry.name),
    );
    const owned = await Promise.all(
      candidates.map(async (entry) => {
        const dir = join(this.options.dir, entry.name);
        return (await holdsOnlyFfmpegOutput(dir)) ? dir : null;
      }),
    );
    await Promise.all(owned.flatMap((dir) => (dir ? [this.remove(dir)] : [])));
  }

  /**
   * Never rejects: the idle timer calls `close` without awaiting it, and a SIGKILLed FFmpeg
   * may still be writing while the tree is removed (ENOTEMPTY), so it is retried and logged.
   */
  private async remove(dir: string): Promise<void> {
    try {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (error) {
      this.options.logger.error({ err: error, dir }, 'session directory not removed');
    }
  }

  /** Server shutdown: every session is closed (`close` never rejects). */
  async closeAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }
}

/** True when every entry is a playlist or segment FFmpeg writes (`.tmp` while in flight). */
async function holdsOnlyFfmpegOutput(dir: string): Promise<boolean> {
  try {
    const names = await readdir(dir);
    return names.every((name) => {
      const final = name.endsWith('.tmp') ? name.slice(0, -'.tmp'.length) : name;
      return final === PLAYLIST_NAME || SEGMENT_PATTERN.test(final);
    });
  } catch {
    return false;
  }
}
