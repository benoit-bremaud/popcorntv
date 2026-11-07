import { describe, expect, it } from 'vitest';
import type { StreamInfo } from './index.js';
import {
  audioTracks,
  decidePlayback,
  directPlayMime,
  effectiveAudioIndex,
  isFinished,
  matchAudioTrack,
} from './playback.js';

function stream(type: StreamInfo['type'], codec: string): StreamInfo {
  return { type, codec, width: null, height: null, language: null };
}

const h264Aac = [stream('video', 'h264'), stream('audio', 'aac')];

describe('directPlayMime', () => {
  it('maps an MP4 H.264 + AAC file to its RFC 6381 MIME string', () => {
    expect(directPlayMime({ relativePath: 'Films/Heat (1995).mp4', streams: h264Aac })).toBe(
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    );
  });

  it('treats .m4v as MP4 and ignores the extension case', () => {
    expect(directPlayMime({ relativePath: 'a.M4V', streams: h264Aac })).toBe(
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    );
  });

  it('maps WebM VP9 + Opus and keeps only the first video and audio streams', () => {
    const streams = [
      stream('video', 'vp9'),
      stream('audio', 'opus'),
      stream('audio', 'dts'),
      stream('subtitle', 'webvtt'),
    ];
    expect(directPlayMime({ relativePath: 'b.webm', streams })).toBe(
      'video/webm; codecs="vp9, opus"',
    );
  });

  it('ignores the codec case and dots in the file name', () => {
    const streams = [stream('video', 'H264'), stream('audio', 'AAC')];
    expect(directPlayMime({ relativePath: 'Mr. Robot S01E01.v2.mp4', streams })).toBe(
      'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    );
  });

  it('accepts a silent video', () => {
    expect(directPlayMime({ relativePath: 'c.mp4', streams: [stream('video', 'h264')] })).toBe(
      'video/mp4; codecs="avc1.640028"',
    );
  });

  it.each([
    ['an MKV container', 'd.mkv', h264Aac],
    ['no extension', 'README', h264Aac],
    ['a series row without file', null, []],
    ['no video stream', 'e.mp4', [stream('audio', 'aac')]],
    ['an unknown video codec', 'f.mp4', [stream('video', 'mpeg2video')]],
    ['an unknown audio codec', 'g.mp4', [stream('video', 'h264'), stream('audio', 'ac3')]],
    ['a codec of the other container', 'h.webm', h264Aac],
  ])('returns null for %s', (_label, relativePath, streams) => {
    expect(directPlayMime({ relativePath, streams })).toBeNull();
  });
});

describe('decidePlayback', () => {
  const media = { relativePath: 'a.mp4', streams: h264Aac };

  it.each(['probably', 'maybe'])('plays directly when the browser answers %s', (answer) => {
    const decision = decidePlayback(media, () => answer);
    expect(decision).toEqual({
      mode: 'direct',
      mime: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    });
  });

  it('is unsupported when the browser answers an empty string', () => {
    expect(decidePlayback(media, () => '')).toEqual({ mode: 'unsupported' });
  });

  it('never asks the browser about a file it cannot describe', () => {
    let asked = false;
    const decision = decidePlayback({ relativePath: 'a.avi', streams: h264Aac }, () => {
      asked = true;
      return 'probably';
    });
    expect(decision).toEqual({ mode: 'unsupported' });
    expect(asked).toBe(false);
  });
});

describe('isFinished', () => {
  it('is true from 90 % of the duration', () => {
    expect(isFinished({ positionSec: 90, durationSec: 100 })).toBe(true);
    expect(isFinished({ positionSec: 100, durationSec: 100 })).toBe(true);
  });

  it('is false just below 90 %', () => {
    expect(isFinished({ positionSec: 89, durationSec: 100 })).toBe(false);
  });

  it('is never true without a positive duration', () => {
    expect(isFinished({ positionSec: 5000, durationSec: null })).toBe(false);
    expect(isFinished({ positionSec: 0, durationSec: 0 })).toBe(false);
  });
});

describe('audioTracks', () => {
  it('numbers the audio streams in order with their language', () => {
    const streams: StreamInfo[] = [
      { type: 'video', codec: 'h264', width: 1920, height: 1080, language: null },
      { type: 'audio', codec: 'AC3', width: null, height: null, language: 'fre' },
      { type: 'subtitle', codec: 'srt', width: null, height: null, language: 'eng' },
      { type: 'audio', codec: 'aac', width: null, height: null, language: null },
    ];

    expect(audioTracks(streams)).toEqual([
      { index: 0, codec: 'ac3', language: 'fre' },
      { index: 1, codec: 'aac', language: null },
    ]);
  });
});

const audio = (language: string | null): StreamInfo => ({
  type: 'audio',
  codec: 'aac',
  width: null,
  height: null,
  language,
});

describe('effectiveAudioIndex', () => {
  it.each([
    [1, 1],
    [2, 0],
  ])('plays index %i as %i in a two-track file', (index, expected) => {
    expect(effectiveAudioIndex([audio('fre'), audio('eng')], index)).toBe(expected);
  });
});

describe('matchAudioTrack', () => {
  const next = [audio('eng'), audio('fre')];

  it('keeps the chosen language in the next file, whatever its position', () => {
    expect(matchAudioTrack(next, { index: 0, codec: 'aac', language: 'fre' })).toBe(1);
  });

  it('falls back to the same index without a language match, else the first', () => {
    expect(matchAudioTrack(next, { index: 1, codec: 'aac', language: 'jpn' })).toBe(1);
    expect(matchAudioTrack(next, { index: 1, codec: 'aac', language: null })).toBe(1);
    expect(matchAudioTrack([audio('eng')], { index: 3, codec: 'aac', language: null })).toBe(0);
  });
});
