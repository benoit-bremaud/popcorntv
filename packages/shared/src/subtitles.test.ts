import { describe, expect, it } from 'vitest';
import type { StreamInfo } from './index.js';
import { subtitleTracks } from './subtitles.js';

function stream(
  type: StreamInfo['type'],
  codec: string,
  language: string | null = null,
): StreamInfo {
  return { type, codec, width: null, height: null, language };
}

describe('subtitleTracks', () => {
  it('numbers tracks among subtitle streams and keeps text codecs only', () => {
    const streams = [
      stream('video', 'h264'),
      stream('audio', 'aac', 'eng'),
      stream('subtitle', 'hdmv_pgs_subtitle', 'eng'),
      stream('subtitle', 'SubRip', 'fre'),
      stream('subtitle', 'ass'),
    ];

    expect(subtitleTracks(streams)).toEqual([
      { index: 1, codec: 'subrip', language: 'fre' },
      { index: 2, codec: 'ass', language: null },
    ]);
  });

  it('returns nothing for a file without subtitles', () => {
    expect(subtitleTracks([stream('video', 'h264')])).toEqual([]);
  });

  it.each(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])('offers %s', (codec) => {
    expect(subtitleTracks([stream('subtitle', codec)])).toHaveLength(1);
  });

  it.each(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle'])(
    'leaves out image codec %s',
    (codec) => {
      expect(subtitleTracks([stream('subtitle', codec)])).toEqual([]);
    },
  );
});
