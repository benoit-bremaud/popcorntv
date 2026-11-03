import { describe, expect, it } from 'vitest';
import { shiftWebVtt } from './webvtt.js';

const VTT = [
  'WEBVTT',
  '',
  'NOTE made by FFmpeg',
  '',
  '1',
  '00:00:01.000 --> 00:00:02.500',
  'Gone',
  '',
  '00:09.000 --> 00:11.250 align:start',
  'Straddles',
  '',
  '01:00:10.040 --> 01:00:12.000',
  'Late',
  '',
].join('\n');

describe('shiftWebVtt', () => {
  it('returns the text untouched for offset 0', () => {
    expect(shiftWebVtt(VTT, 0)).toBe(VTT);
  });

  it('drops past cues, clamps a straddling one and shifts the rest, settings kept', () => {
    expect(shiftWebVtt(VTT, 10)).toBe(
      [
        'WEBVTT',
        '',
        'NOTE made by FFmpeg',
        '',
        '00:00:00.000 --> 00:00:01.250 align:start',
        'Straddles',
        '',
        '01:00:00.040 --> 01:00:02.000',
        'Late',
        '',
      ].join('\n'),
    );
  });

  it('reads CRLF files', () => {
    expect(shiftWebVtt('WEBVTT\r\n\r\n00:00:05.000 --> 00:00:06.000\r\nHi\r\n', 1)).toBe(
      'WEBVTT\n\n00:00:04.000 --> 00:00:05.000\nHi\n',
    );
  });
});
