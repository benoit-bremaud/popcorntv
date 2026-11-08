import { describe, expect, it } from 'vitest';
import { parseKeyframe } from './keyframe-probe.js';

describe('parseKeyframe', () => {
  it('returns the first keyframe, relative to the stream start', () => {
    const output = {
      streams: [{ start_time: '0.080000' }],
      packets: [
        { pts_time: '40.040000', flags: 'K__' },
        { pts_time: '40.080000', flags: '___' },
      ],
    };

    expect(parseKeyframe(output, 42)).toBe(39.96);
  });

  it('skips packets that are not keyframes or have no time', () => {
    const output = {
      packets: [
        { pts_time: '41.000000', flags: '___' },
        { pts_time: 'N/A', flags: 'K__' },
        { pts_time: '36.500000', flags: 'K_' },
      ],
    };

    expect(parseKeyframe(output, 42)).toBe(36.5);
  });

  it.each([
    ['after the requested start', [{ pts_time: '43', flags: 'K__' }]],
    ['before the stream start', [{ pts_time: '-1', flags: 'K__' }]],
    ['missing', []],
  ])('returns null when the keyframe is %s', (_case, packets) => {
    expect(parseKeyframe({ packets }, 42)).toBeNull();
  });
});
