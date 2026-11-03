/** Pure WebVTT cue shift (ADR-0009 §3): the HLS timeline of a resumed session starts at `offsetSec`. */

const TIMING = /^((?:\d+:)?\d{2}:\d{2}\.\d{3}) --> ((?:\d+:)?\d{2}:\d{2}\.\d{3})(.*)$/;

/** `[hh:]mm:ss.mmm` → milliseconds. */
function toMs(stamp: string): number {
  const [clock = '', millis = '0'] = stamp.split('.');
  const seconds = clock.split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return seconds * 1000 + Number(millis);
}

/** Milliseconds → `hh:mm:ss.mmm`. */
function toStamp(ms: number): string {
  const pad = (value: number, width = 2): string => String(value).padStart(width, '0');
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor(ms / 60_000) % 60;
  const seconds = Math.floor(ms / 1000) % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms % 1000, 3)}`;
}

/**
 * Moves every cue `offsetSec` earlier: a cue ending at or before the offset is dropped, one
 * straddling it starts at 0. Header, NOTE and STYLE blocks and cue settings are kept.
 */
export function shiftWebVtt(text: string, offsetSec: number): string {
  if (offsetSec <= 0) return text;
  const offsetMs = offsetSec * 1000;
  const blocks = text.replaceAll('\r\n', '\n').split(/\n{2,}/);
  const kept: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex((line) => TIMING.test(line));
    const timing = at === -1 ? null : TIMING.exec(lines[at] ?? '');
    if (timing === null) {
      kept.push(block);
      continue;
    }
    const [, start = '', end = '', settings = ''] = timing;
    const endMs = toMs(end) - offsetMs;
    if (endMs <= 0) continue;
    const startMs = Math.max(0, toMs(start) - offsetMs);
    lines[at] = `${toStamp(startMs)} --> ${toStamp(endMs)}${settings}`;
    kept.push(lines.join('\n'));
  }
  return kept.join('\n\n');
}
