import { writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleExtractor, subtitleArgs } from './subtitle-extractor.js';
import type { ExitListener, Transcoder } from './transcoder.js';

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n';

describe('SubtitleExtractor', () => {
  let base: string;
  let dir: string;
  let film: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'popcorntv-subs-'));
    dir = join(base, 'subtitles');
    film = join(base, 'a.mkv');
    await writeFile(film, 'film');
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  /** A fake FFmpeg that writes its last argument and exits with the next code (0 by default). */
  function fakeTranscoder(...codes: number[]) {
    return vi.fn<Transcoder>((args, onExit) => {
      const code = codes.shift() ?? 0;
      if (code === 0) writeFileSync(args.at(-1) ?? '', VTT);
      queueMicrotask(() => onExit(code, 'boom'));
      return { kill: vi.fn() };
    });
  }

  async function cacheName(): Promise<string> {
    return `m1-2-${Math.trunc((await stat(film)).mtimeMs)}.vtt`;
  }

  it('extracts once, then serves the cached file', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });

    await expect(extractor.get('m1', 2, film)).resolves.toBe(VTT);
    await expect(extractor.get('m1', 2, film)).resolves.toBe(VTT);

    expect(transcoder).toHaveBeenCalledTimes(1);
    const name = await cacheName();
    expect(transcoder.mock.calls[0]?.[0]).toEqual(subtitleArgs(film, 2, join(dir, `${name}.part`)));
    expect(await readdir(dir)).toEqual([name]);
  });

  it('extracts again when the file changed and removes the older entry', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });
    await extractor.get('m1', 2, film);

    await utimes(film, new Date(), new Date(Date.now() + 60_000));
    await extractor.get('m1', 2, film);

    expect(transcoder).toHaveBeenCalledTimes(2);
    expect(await readdir(dir)).toEqual([await cacheName()]);
  });

  it('shares one run between concurrent requests', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });

    const both = await Promise.all([extractor.get('m1', 0, film), extractor.get('m1', 0, film)]);

    expect(both).toEqual([VTT, VTT]);
    expect(transcoder).toHaveBeenCalledTimes(1);
  });

  it('rejects on an FFmpeg failure, caches nothing, and succeeds on a retry', async () => {
    const extractor = new SubtitleExtractor({ transcoder: fakeTranscoder(1), dir });

    await expect(extractor.get('m1', 0, film)).rejects.toThrow('ffmpeg exited with 1: boom');
    expect(await readdir(dir)).toEqual([]);
    await expect(extractor.get('m1', 0, film)).resolves.toBe(VTT);
  });

  it('propagates a cache read error other than a missing file', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });
    await mkdir(join(dir, `m1-0-${Math.trunc((await stat(film)).mtimeMs)}.vtt`), {
      recursive: true,
    });

    await expect(extractor.get('m1', 0, film)).rejects.toThrow();
    expect(transcoder).not.toHaveBeenCalled();
  });

  it('runs at most maxRuns extractions at once, the others wait', async () => {
    const exits: (() => void)[] = [];
    const transcoder = vi.fn<Transcoder>((args, onExit) => {
      exits.push(() => {
        writeFileSync(args.at(-1) ?? '', VTT);
        onExit(0, '');
      });
      return { kill: vi.fn() };
    });
    const extractor = new SubtitleExtractor({ transcoder, dir, maxRuns: 1 });

    const first = extractor.get('m1', 0, film);
    const second = extractor.get('m1', 1, film);
    await vi.waitFor(() => expect(transcoder).toHaveBeenCalledTimes(1));
    exits[0]?.();
    await first;
    await vi.waitFor(() => expect(transcoder).toHaveBeenCalledTimes(2));
    exits[1]?.();

    await expect(second).resolves.toBe(VTT);
  });

  it('kills FFmpeg past the timeout and rejects once it exited', async () => {
    let exit: ExitListener = () => undefined;
    const kill = vi.fn(() => exit(null, ''));
    const transcoder = vi.fn<Transcoder>((_args, onExit) => {
      exit = onExit;
      return { kill };
    });
    const extractor = new SubtitleExtractor({ transcoder, dir, timeoutMs: 10 });

    await expect(extractor.get('m1', 0, film)).rejects.toThrow('timed out');

    expect(kill).toHaveBeenCalled();
    expect(await readdir(dir)).toEqual([]);
  });

  it('kills the running extractions on closeAll', async () => {
    const kill = vi.fn();
    const transcoder = vi.fn<Transcoder>(() => ({ kill }));
    const extractor = new SubtitleExtractor({ transcoder, dir });
    void extractor.get('m1', 0, film).catch(() => undefined);
    await vi.waitFor(() => expect(transcoder).toHaveBeenCalled());

    extractor.closeAll();

    expect(kill).toHaveBeenCalledTimes(1);
  });
});
