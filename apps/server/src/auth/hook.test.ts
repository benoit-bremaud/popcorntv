import { describe, expect, it } from 'vitest';
import { cookiePolicy, isCrossSite, readCookie, sessionCookie } from './hook.js';

const ORIGIN = 'https://tv.example.org';

describe('cookiePolicy and sessionCookie', () => {
  it('uses the __Host- prefix and Secure on https', () => {
    const policy = cookiePolicy('https://tv.example.org');

    expect(policy).toEqual({ name: '__Host-pctv_session', secure: true, origin: ORIGIN });
    expect(sessionCookie(policy, 'tok')).toBe(
      '__Host-pctv_session=tok; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000; Secure',
    );
  });

  it('drops both on http (dev) and clears with Max-Age=0', () => {
    const policy = cookiePolicy('http://localhost:5173');

    expect(policy.name).toBe('pctv_session');
    expect(sessionCookie(policy, null)).toBe(
      'pctv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  });
});

describe('readCookie', () => {
  it.each([
    [undefined, null],
    ['', null],
    ['pctv_session=abc', 'abc'],
    ['other=1; pctv_session=abc; x=y', 'abc'],
    ['xpctv_session=abc', null],
    ['pctv_session=', null],
    ['=abc; pctv_session = abc ', 'abc'],
  ])('reads %j as %j', (header, expected) => {
    expect(readCookie(header, 'pctv_session')).toBe(expected);
  });
});

describe('isCrossSite', () => {
  it.each([
    ['GET', { origin: 'https://evil.example' }, false],
    ['HEAD', { 'sec-fetch-site': 'cross-site' }, false],
    ['POST', {}, false],
    ['POST', { origin: ORIGIN }, false],
    ['POST', { origin: ORIGIN, 'sec-fetch-site': 'same-origin' }, false],
    ['POST', { 'sec-fetch-site': 'same-site' }, false],
    ['POST', { 'sec-fetch-site': 'none' }, false],
    ['POST', { 'sec-fetch-site': 'cross-site' }, true],
    ['PUT', { origin: ORIGIN, 'sec-fetch-site': 'cross-site' }, true],
    ['DELETE', { origin: 'https://evil.example' }, true],
    ['PATCH', { origin: 'null' }, true],
    ['POST', { origin: 'https://tv.example.org.evil.example' }, true],
  ])('%s with %j → %s', (method, headers, expected) => {
    expect(isCrossSite(method, headers, ORIGIN)).toBe(expected);
  });
});
