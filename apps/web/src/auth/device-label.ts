/**
 * Readable device names for the admin device list (#174). Only the common browsers and
 * systems are named; the goal is telling two devices of one account apart, not analytics.
 * Order matters: Chromium-based browsers also carry "Chrome" and "Safari" in their UA.
 */
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\bWindows\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\biPad\b/, 'iPadOS'],
  [/\b(?:iPhone|iPod)\b/, 'iOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bMac OS X\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(table: readonly (readonly [RegExp, string])[], ua: string) {
  return table.find(([pattern]) => pattern.test(ua))?.[1];
}

/** "Chrome on Linux"; the raw string when nothing is recognised; "Unknown device" when blank. */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent?.trim() ?? '';
  if (ua === '') return 'Unknown device';
  const browser = firstMatch(BROWSERS, ua);
  const system = firstMatch(SYSTEMS, ua);
  if (browser && system) return `${browser} on ${system}`;
  if (system) return `Device on ${system}`;
  return browser ?? ua;
}
