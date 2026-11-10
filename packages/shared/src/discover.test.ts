import { describe, expect, it } from 'vitest';
import { normaliseTitleLink, TITLE_LINK_MAX } from './discover.js';

describe('normaliseTitleLink', () => {
  it('should accept http and https links and normalise them', () => {
    expect(normaliseTitleLink('  https://Example.org/watch?id=1 ')).toBe(
      'https://example.org/watch?id=1',
    );
    expect(normaliseTitleLink('http://example.org')).toBe('http://example.org/');
  });

  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<b>x</b>'],
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://example.org/a'],
    ['relative', '/watch'],
    ['not a URL', 'not a link'],
    ['empty', '   '],
    ['user name', 'https://user@example.org/'],
    ['password', 'https://user:secret@example.org/'],
  ])('should refuse a %s link', (_label, raw) => {
    expect(normaliseTitleLink(raw)).toBeNull();
  });

  it('should accept a link at the length cap and refuse one past it', () => {
    const base = 'https://example.org/';
    const atCap = base + 'a'.repeat(TITLE_LINK_MAX - base.length);
    expect(normaliseTitleLink(atCap)).toBe(atCap);
    expect(normaliseTitleLink(`${atCap}a`)).toBeNull();
  });

  it('should refuse a link whose normalised form grows past the cap', () => {
    const base = 'https://example.org/';
    // A space becomes %20: the input fits, the normalised href does not.
    const raw = `${base}${'a'.repeat(TITLE_LINK_MAX - base.length - 2)} b`;
    expect(raw).toHaveLength(TITLE_LINK_MAX);

    expect(normaliseTitleLink(raw)).toBeNull();
  });
});
