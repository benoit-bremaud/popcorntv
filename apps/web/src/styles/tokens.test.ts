/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import css from './tokens.css?raw';

/** Reads a `--name: #rrggbb` token from tokens.css. */
function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i').exec(css);
  if (!match?.[1]) throw new Error(`token --${name} is not a #rrggbb colour`);
  return match[1];
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('contrast helper', () => {
  it('gives the WCAG extremes', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrast('#1b1518', '#1b1518')).toBe(1);
  });

  it('measures the user-agent placeholder grey below 4.5:1 on surface (#167)', () => {
    expect(contrast('#757575', token('color-surface'))).toBeLessThan(4.5);
  });

  it('refuses a token that is not a hex colour', () => {
    expect(() => token('color-scrim')).toThrow(/not a #rrggbb/);
  });
});

describe('placeholder contrast (#167, WCAG 1.4.3)', () => {
  it('styles every placeholder with the muted token at full opacity', () => {
    expect(css).toMatch(
      /::placeholder\s*\{\s*color:\s*var\(--color-text-muted\);\s*opacity:\s*1;\s*\}/,
    );
  });

  it.each(['color-bg', 'color-surface', 'color-surface-raised'])(
    'muted text reaches 4.5:1 on --%s',
    (background) => {
      expect(contrast(token('color-text-muted'), token(background))).toBeGreaterThanOrEqual(4.5);
    },
  );
});
