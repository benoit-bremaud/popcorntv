/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import html from '../../404.html?raw';

import css from './not-found.css?raw';

describe('static 404 page (#177, #264)', () => {
  it('reads both files', () => {
    expect(html).toContain('not-found__code');
    expect(css).toContain('.spill__fly');
  });

  it('stays script- and inline-style-free for the CSP', () => {
    expect(html).not.toMatch(/<script|<style|\sstyle=/i);
  });

  it('hides the decorative popcorn from assistive tech', () => {
    expect(html).toMatch(/<svg class="spill"[^>]*aria-hidden="true"/);
  });

  it('never loops the popcorn forever (WCAG 2.2.2)', () => {
    expect(css).not.toMatch(/infinite/);
  });

  it('stops the popcorn under reduced motion', () => {
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.spill__box,\s*\.spill__fly\s*\{\s*animation: none;/,
    );
  });
});
