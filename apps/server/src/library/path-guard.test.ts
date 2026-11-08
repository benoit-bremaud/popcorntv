import { describe, expect, it } from 'vitest';
import { hasControlChar, resolveUnderRoot } from './path-guard.js';

describe('resolveUnderRoot', () => {
  const root = '/srv/media/films';

  it.each([
    ['Matrix (1999)/Matrix (1999).mkv', '/srv/media/films/Matrix (1999)/Matrix (1999).mkv'],
    ['/srv/media/films/a.mkv', '/srv/media/films/a.mkv'],
    ['..foo.mkv', '/srv/media/films/..foo.mkv'],
    ['sub/...hidden/a.mkv', '/srv/media/films/sub/...hidden/a.mkv'],
  ])('accepts %s inside the root', (candidate, expected) => {
    expect(resolveUnderRoot(root, candidate)).toBe(expected);
  });

  it.each([
    ['.'],
    ['..'],
    ['../series/a.mkv'],
    ['sub/../../a.mkv'],
    ['/srv/media/films-private/a.mkv'],
    ['/srv/media'],
    ['/etc/passwd'],
  ])('rejects %s (root itself, traversal, sibling or ancestor)', (candidate) => {
    expect(resolveUnderRoot(root, candidate)).toBeNull();
  });
});

describe('hasControlChar', () => {
  it.each([
    ['NUL', '/media/films\u0000'],
    ['newline', '/media/fi\nlms'],
    ['carriage return', 'Films\r'],
    ['tab', '\tFilms'],
    ['escape', 'Fi\u001blms'],
    ['DEL', 'Films\u007f'],
    ['C1 control', 'Films\u0085'],
    ['last C1 control', 'Films\u009f'],
  ])('finds a %s', (_label, value) => {
    expect(hasControlChar(value)).toBe(true);
  });

  it.each([
    ['plain path', '/media/films'],
    ['trailing slash', '/media/films/'],
    ['spaces and punctuation', 'Films (VO) & docs!'],
    ['NFC accent', 'Fran\u00e7ais'],
    ['NFD accent', 'Franc\u0327ais'],
    ['emoji', 'Films \u{1f37f}'],
    ['first char after C1', 'Films\u00a0'],
    ['empty string', ''],
  ])('accepts a %s', (_label, value) => {
    expect(hasControlChar(value)).toBe(false);
  });
});
