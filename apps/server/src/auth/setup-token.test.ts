import { describe, expect, it } from 'vitest';
import { SetupToken } from './setup-token.js';
import { hashToken, newToken, sameHash } from './token.js';

describe('tokens', () => {
  it('draws 256-bit base64url tokens that never repeat', () => {
    const tokens = new Set(Array.from({ length: 100 }, newToken));

    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('stores the SHA-256 hex, never the token', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it.each([
    ['aa', 'aa', true],
    ['aa', 'ab', false],
    ['aa', 'aaa', false],
  ])('compares %s and %s in constant time → %s', (a, b, expected) => {
    expect(sameHash(a, b)).toBe(expected);
  });
});

describe('SetupToken', () => {
  it('matches the issued token until it expires after an hour', () => {
    const setup = new SetupToken();
    const token = setup.issue(0);

    expect(setup.matches(token, 3_599_999)).toBe(true);
    expect(setup.matches(token, 3_600_000)).toBe(false);
    expect(setup.matches(`${token}x`, 0)).toBe(false);
  });

  it('forgets the previous token when a new one is issued, and every token once cleared', () => {
    const setup = new SetupToken();
    const first = setup.issue(0);
    const second = setup.issue(0);

    expect(setup.matches(first, 0)).toBe(false);
    expect(setup.matches(second, 0)).toBe(true);
    setup.clear();
    expect(setup.matches(second, 0)).toBe(false);
  });

  it('matches nothing before a token is issued', () => {
    expect(new SetupToken().matches('anything')).toBe(false);
  });
});
