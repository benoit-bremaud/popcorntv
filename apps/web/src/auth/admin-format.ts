/** Pure wording helpers of the Administration panel (#175). */

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * ISO 8601 date and time in the viewer's time zone, with the zone name
 * (`2026-11-08 00:34 CET`), whatever the browser language; `never` for no date.
 */
export function formatDateTime(iso: string | null, timeZone?: string): string {
  if (iso === null) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${pad(Number(part('hour')))}:${part('minute')} ${part('timeZoneName')}`;
}

/** `1 device`, `0 devices`, `3 devices`. */
export function deviceCount(count: number): string {
  return `${count} ${count === 1 ? 'device' : 'devices'}`;
}
