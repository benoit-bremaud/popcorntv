import { describe, expect, it } from 'vitest';
import { deviceLabel } from './device-label.js';

const UA = {
  chromeLinux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  firefoxWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  safariIpad:
    'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  firefoxIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  samsungAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
  operaMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  androidStock:
    'Mozilla/5.0 (Linux; U; Android 4.4.2; en-us; SM-T230 Build/KOT49H) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
  operaIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPT/5.0.0 Mobile/15E148',
  tizenTv:
    'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 TV Safari/537.36',
  chromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
} as const;

describe('deviceLabel', () => {
  it.each([
    [UA.chromeLinux, 'Chrome on Linux'],
    [UA.firefoxWindows, 'Firefox on Windows'],
    [UA.safariMac, 'Safari on macOS'],
    [UA.safariIphone, 'Safari on iOS'],
    [UA.safariIpad, 'Safari on iPadOS'],
    [UA.chromeIos, 'Chrome on iOS'],
    [UA.firefoxIos, 'Firefox on iOS'],
    [UA.chromeAndroid, 'Chrome on Android'],
    [UA.samsungAndroid, 'Samsung Internet on Android'],
    [UA.chromeOs, 'Chrome on ChromeOS'],
    [UA.androidStock, 'Safari on Android'],
    [UA.tizenTv, 'Device on Tizen'],
  ])('names a common browser and system: %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it('does not mistake Edge or Opera for Chrome', () => {
    expect(deviceLabel(UA.edgeWindows)).toBe('Edge on Windows');
    expect(deviceLabel(UA.operaMac)).toBe('Opera on macOS');
    expect(deviceLabel(UA.operaIos)).toBe('Opera on iOS');
  });

  it('names the part it recognises when the other is unknown', () => {
    expect(deviceLabel('Firefox/132.0')).toBe('Firefox');
    expect(deviceLabel('SomeApp/1.0 (Linux; Android 13)')).toBe('Device on Android');
  });

  it('falls back to the raw string when nothing is recognised', () => {
    expect(deviceLabel('curl/8.5.0')).toBe('curl/8.5.0');
    expect(deviceLabel('Googlebot/2.1 (+http://www.google.com/bot.html)')).toBe(
      'Googlebot/2.1 (+http://www.google.com/bot.html)',
    );
  });

  it('answers "Unknown device" for a missing or blank user agent', () => {
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(deviceLabel('')).toBe('Unknown device');
    expect(deviceLabel('   ')).toBe('Unknown device');
  });

  it('still reads a user agent the server truncated at 200 characters', () => {
    const long = UA.edgeWindows.replace(' Edg/', ` ${'x'.repeat(100)} Edg/`);
    expect(long.length).toBeGreaterThan(200);

    expect(deviceLabel(long.slice(0, 200))).toBe('Chrome on Windows');
  });
});
