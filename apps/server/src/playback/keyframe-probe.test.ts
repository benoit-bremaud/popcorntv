import { describe, expect, it } from 'vitest';
import { parseFramecrc } from './keyframe-probe.js';

const HEADER = '#software: Lavf62.3.100\n#tb 0: 1/1000\n#media_type 0: video\n';

describe('parseFramecrc', () => {
  it('returns the video packet pts in seconds, not its dts', () => {
    const output = `${HEADER}0,      39960,      40001,       41,     9261, 0x1cc1ab7a\n`;

    expect(parseFramecrc(output)).toBe(40.001);
  });

  it('returns the earliest pts over every stream, each in its own time base', () => {
    const output = [
      '#tb 0: 1/90000',
      '#tb 1: 1/48000',
      '1,     326880,     326880,     1024,      371, 0x0', // audio at 6.81 s leads
      '0,     891000,     898506,     3750,     9261, 0x0', // video keyframe at 9.983 s
      '',
    ].join('\n');

    expect(parseFramecrc(output)).toBeCloseTo(6.81, 6);
  });

  it('applies a non-millisecond time base', () => {
    expect(parseFramecrc('#tb 0: 1001/24000\n0, 960, 960, 1, 10, 0x0\n')).toBeCloseTo(40.04, 6);
  });

  it('never returns a negative time', () => {
    expect(parseFramecrc('#tb 0: 1/1000\n0, -84, -42, 1, 10, 0x0\n')).toBe(0);
  });

  it.each([
    ['no packet', HEADER],
    ['no time base', '0, 1, 1, 1, 1, 0x0\n'],
    ['a zero denominator', '#tb 0: 1/0\n0, 1, 1, 1, 1, 0x0\n'],
    ['a packet of a stream without time base', '#tb 0: 1/1000\n1, 5, 5, 1, 1, 0x0\n'],
  ])('returns null with %s', (_case, output) => {
    expect(parseFramecrc(output)).toBeNull();
  });
});
