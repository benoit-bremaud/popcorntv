import { writeFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubtitleExtractor, subtitleArgs } from './subtitle-extractor.js';
import type { ExitListener, Transcoder } from './transcoder.js';

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n';

describe('SubtitleExtractor', () => {
  let dir: string;

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'popcorntv-subs-')), 'subtitles');
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(join(dir, '..'), { recursive: true, force: true });
  });

  /** A fake FFmpeg that writes its last argument and exits with `code`. */
  function fakeTranscoder(code = 0) {
    return vi.fn<Transcoder>((args, onExit) => {
      if (code === 0) writeFileSync(args.at(-1) ?? '', VTT);
      queueMicrotask(() => onExit(code, 'boom'));
      return { kill: vi.fn() };
    });
  }

  it('extracts once, then serves the cached file', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });

    await expect(extractor.get('m1', 2, '/media/a.mkv', 1234.5)).resolves.toBe(VTT);
    await expect(extractor.get('m1', 2, '/media/a.mkv', 1234.5)).resolves.toBe(VTT);

    expect(transcoder).toHaveBeenCalledTimes(1);
    expect(transcoder.mock.calls[0]?.[0]).toEqual(
      subtitleArgs('/media/a.mkv', 2, join(dir, 'm1-2-1234.vtt.part')),
    );
    expect(await readdir(dir)).toEqual(['m1-2-1234.vtt']);
  });

  it('shares one run between concurrent requests', async () => {
    const transcoder = fakeTranscoder();
    const extractor = new SubtitleExtractor({ transcoder, dir });

    const both = await Promise.all([
      extractor.get('m1', 0, '/a.mkv', 1),
      extractor.get('m1', 0, '/a.mkv', 1),
    ]);

    expect(both).toEqual([VTT, VTT]);
    expect(transcoder).toHaveBeenCalledTimes(1);
  });

  it('rejects on an FFmpeg failure and caches nothing', async () => {
    const extractor = new SubtitleExtractor({ transcoder: fakeTranscoder(1), dir });

    await expect(extractor.get('m1', 0, '/a.mkv', 1)).rejects.toThrow('ffmpeg exited with 1: boom');
    expect(await readdir(dir)).toEqual([]);
  });

  it('kills FFmpeg and rejects past the timeout', async () => {
    vi.useFakeTimers();
    const kill = vi.fn();
    let exit: ExitListener = () => undefined;
    const transcoder = vi.fn<Transcoder>((_args, onExit) => {
      exit = onExit;
      return { kill };
    });
    const extractor = new SubtitleExtractor({ transcoder, dir, timeoutMs: 1000 });

    const result = extractor.get('m1', 0, '/a.mkv', 1);
    await vi.waitFor(() => expect(transcoder).toHaveBeenCalled());
    const assertion = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(kill).toHaveBeenCalled();
    exit(null, '');
  });
});
