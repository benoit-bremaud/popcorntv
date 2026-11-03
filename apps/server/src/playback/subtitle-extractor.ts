import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Transcoder } from './transcoder.js';

/** What the extractor needs; built by `buildApp`. */
export interface SubtitleExtractorOptions {
  /** FFmpeg runner, the same injected egress as the HLS sessions (ADR-0006). */
  readonly transcoder: Transcoder;
  /** Cache folder, `TRANSCODE_DIR/subtitles` (spec subtitles §2.2). */
  readonly dir: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

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

/**
 * Extracts a text subtitle track to WebVTT on first request and caches it unshifted under a
 * name carrying the file's mtime, so a modified file is extracted again (ADR-0009 §2).
 * Concurrent requests for one track share a single FFmpeg run.
 */
export class SubtitleExtractor {
  private readonly running = new Map<string, Promise<string>>();

  constructor(private readonly options: SubtitleExtractorOptions) {}

  /** The WebVTT text of track `index`; rejects when FFmpeg fails or runs past the timeout. */
  get(mediaId: string, index: number, filePath: string, mtimeMs: number): Promise<string> {
    const name = `${mediaId}-${index}-${Math.trunc(mtimeMs)}.vtt`;
    const pending = this.running.get(name);
    if (pending !== undefined) return pending;
    const work = this.load(name, index, filePath).finally(() => this.running.delete(name));
    this.running.set(name, work);
    return work;
  }

  private async load(name: string, index: number, filePath: string): Promise<string> {
    const target = join(this.options.dir, name);
    try {
      return await readFile(target, 'utf8');
    } catch {
      // Not cached yet.
    }
    await mkdir(this.options.dir, { recursive: true });
    const part = `${target}.part`;
    try {
      await this.run(subtitleArgs(filePath, index, part));
      await rename(part, target);
    } catch (error) {
      await rm(part, { force: true });
      throw error;
    }
    return readFile(target, 'utf8');
  }

  private run(args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        handle.kill();
        reject(new Error('subtitle extraction timed out'));
      }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const handle = this.options.transcoder(args, (code, stderrTail) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with ${String(code)}: ${stderrTail}`));
      });
    });
  }
}
