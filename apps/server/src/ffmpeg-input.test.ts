import { describe, expect, it } from 'vitest';
import { INPUT_FORMATS, localInputArgs } from './ffmpeg-input.js';
import { ffprobeArgs } from './library/ffprobe.js';
import { SUPPORTED_EXTENSIONS } from './library/scanner.js';
import { ffmpegArgs } from './playback/ffmpeg-args.js';
import { keyframeArgs } from './playback/keyframe-probe.js';
import { subtitleArgs } from './playback/subtitle-extractor.js';

/** FFmpeg's demuxer for each container the scanner keeps (ADR-0028). */
const DEMUXER_OF: Record<string, string> = {
  '.mkv': 'matroska',
  '.webm': 'matroska',
  '.mp4': 'mov',
  '.m4v': 'mov',
  '.mov': 'mov',
  '.avi': 'avi',
};

/** The two options sit right before `-i`, so they apply to the media input. */
function expectConfinedInput(args: readonly string[], file: string): void {
  const input = args.indexOf('-i');
  expect(args[input + 1]).toBe(file);
  expect(args.slice(input - 4, input)).toEqual(localInputArgs());
  expect(args.filter((arg) => arg === '-i')).toHaveLength(1);
}

describe('localInputArgs', () => {
  it('allows the file protocol only', () => {
    expect(localInputArgs().slice(0, 2)).toEqual(['-protocol_whitelist', 'file']);
  });

  it('whitelists container demuxers and no playlist demuxer', () => {
    const formats = localInputArgs()[3]?.split(',') ?? [];
    expect(formats).toEqual([...INPUT_FORMATS]);
    for (const playlist of ['hls', 'concat', 'ffconcat', 'tee', 'image2', 'data', 'lavfi']) {
      expect(formats).not.toContain(playlist);
    }
  });

  it('covers the demuxer of every extension the scanner keeps', () => {
    for (const extension of SUPPORTED_EXTENSIONS) {
      expect(INPUT_FORMATS).toContain(DEMUXER_OF[extension]);
    }
  });
});

describe('every FFmpeg and ffprobe call confines its input', () => {
  it('ffprobe', () => {
    expectConfinedInput(ffprobeArgs('/media/a.mkv'), '/media/a.mkv');
  });

  it('HLS transcode, resumed or not', () => {
    const streams = [
      { type: 'video', codec: 'h264', width: null, height: null, language: null },
    ] as const;
    expectConfinedInput(ffmpegArgs('/media/a.mkv', streams, '/t') ?? [], '/media/a.mkv');
    expectConfinedInput(ffmpegArgs('/media/a.mkv', streams, '/t', 30) ?? [], '/media/a.mkv');
  });

  it('keyframe probe, with and without audio', () => {
    expectConfinedInput(keyframeArgs('/media/a.mkv', 12, 0), '/media/a.mkv');
    expectConfinedInput(keyframeArgs('/media/a.mkv', 0, null), '/media/a.mkv');
  });

  it('subtitle extraction', () => {
    expectConfinedInput(subtitleArgs('/media/a.mkv', 0, '/tmp/out.vtt'), '/media/a.mkv');
  });
});
