# QA — issue 167 placeholder contrast

Staging replay record for #167 (every input placeholder uses `--color-text-muted`).

- **Date**: 2026-11-09
- **Scope**: `docs/testing/qa-matrix.md` § Placeholder contrast checks (#167).
- **Computed ratios** (WCAG 2.x, `apps/web/src/styles/tokens.test.ts`): muted `#a39a94` is
  5.94:1 on `--color-surface-raised`, 6.52:1 on `--color-surface`, 7.09:1 on `--color-bg`;
  the user-agent `#757575` was 3.56:1, 3.91:1 and 4.25:1.
- **Status**: pending — the owner deferred the real QA passes; the token ratios and the
  `::placeholder` rule are covered by unit tests only.
- **To do**: replay the four checks on local staging (`make staging-up`,
  <https://localhost:8443>) during the next batch QA pass and record the result here.
