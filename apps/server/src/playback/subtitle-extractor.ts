import { mkdir, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TranscodeHandle, Transcoder } from './transcoder.js';

/** What the extractor needs; built by `buildApp`. */
export interface SubtitleExtractorOptions {
  /** FFmpeg runner, the same injected egress as the HLS sessions (ADR-0006). */
  readonly transcoder: Transcoder;
  /** Cache folder, `TRANSCODE_DIR/subtitles` (spec subtitles §2.2). */
  readonly dir: string;
  /** FFmpeg run limit in milliseconds; defaults to 120 000. */
  readonly timeoutMs?: number;
  /** FFmpeg extractions running at once, the others wait; defaults to 2. */
  readonly maxRuns?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_RUNS = 2;

/** FFmpeg arguments writing subtitle stream `index` of `filePath` as WebVTT to `output`. */
export function subtitleArgs(filePath: string, index: number, output: string): string[] {
  return [
    '-v',
    'error',
    '-nostdin',
    '-y',
    '-i',
    filePath,
    '-map',
    `0:s:${index}`,
    '-c:s',
    'webvtt',
    '-f',
    'webvtt',
    output,
  ];
}

/** True for a missing file: the only read error that means "not cached yet". */
function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/**
 * Extracts a text subtitle track to WebVTT on first request and caches it unshifted under a
 * name carrying the file's mtime, so a modified file is extracted again and its older entries
 * are removed (ADR-0009 §2). Concurrent requests for one track share a single FFmpeg run, at
 * most `maxRuns` runs go at once, and `closeAll` kills them at shutdown (#28).
 */
export class SubtitleExtractor {
  private readonly pending = new Map<string, Promise<string>>();
  private readonly handles = new Set<TranscodeHandle>();
  private readonly queue: (() => void)[] = [];
  private runs = 0;

  constructor(private readonly options: SubtitleExtractorOptions) {}

  /** The WebVTT text of track `index`; rejects when FFmpeg fails or runs past the timeout. */
  async get(mediaId: string, index: number, filePath: string): Promise<string> {
    const { mtimeMs } = await stat(filePath);
    const prefix = `${mediaId}-${index}-`;
    const name = `${prefix}${Math.trunc(mtimeMs)}.vtt`;
    const shared = this.pending.get(name);
    if (shared !== undefined) return shared;
    const work = this.load(prefix, name, index, filePath).finally(() => this.pending.delete(name));
    this.pending.set(name, work);
    return work;
  }

  /** Server shutdown: every FFmpeg extraction in flight is killed. */
  closeAll(): void {
    for (const handle of this.handles) handle.kill();
  }

  private async load(
    prefix: string,
    name: string,
    index: number,
    filePath: string,
  ): Promise<string> {
    const target = join(this.options.dir, name);
    try {
      return await readFile(target, 'utf8');
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await mkdir(this.options.dir, { recursive: true });
    // FFmpeg writes beside the target: a half-written file is never served as a cache hit.
    const part = `${target}.part`;
    await this.acquire();
    try {
      await this.run(subtitleArgs(filePath, index, part));
      await rename(part, target);
    } catch (error) {
      await rm(part, { force: true });
      throw error;
    } finally {
      this.release();
    }
    await this.removeStale(prefix, name);
    return readFile(target, 'utf8');
  }

  /** Drops the entries of this track extracted from an older version of the file. */
  private async removeStale(prefix: string, keep: string): Promise<void> {
    const names = await readdir(this.options.dir);
    const stale = names.filter((entry) => entry.startsWith(prefix) && entry.endsWith('.vtt'));
    await Promise.all(
      stale
        .filter((entry) => entry !== keep)
        .map((entry) => rm(join(this.options.dir, entry), { force: true })),
    );
  }

  private async acquire(): Promise<void> {
    if (this.runs < (this.options.maxRuns ?? DEFAULT_MAX_RUNS)) {
      this.runs += 1;
      return;
    }
    // The releasing run hands its slot over: `runs` is unchanged.
    await new Promise<void>((resolve) => this.queue.push(resolve));
  }

  private release(): void {
    const next = this.queue.shift();
    if (next === undefined) this.runs -= 1;
    else next();
  }

  /** Settles on FFmpeg's exit only, so a timed-out process is gone before a retry starts. */
  private run(args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const handle = this.options.transcoder(args, (code, stderrTail) => {
        this.handles.delete(handle);
        clearTimeout(timer);
        if (code === 0 && !timedOut) resolve();
        else if (timedOut) reject(new Error('subtitle extraction timed out'));
        else reject(new Error(`ffmpeg exited with ${String(code)}: ${stderrTail}`));
      });
      this.handles.add(handle);
      const timer = setTimeout(() => {
        timedOut = true;
        handle.kill();
      }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    });
  }
}
