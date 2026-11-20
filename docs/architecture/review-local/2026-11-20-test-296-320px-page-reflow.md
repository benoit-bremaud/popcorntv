# Local review — page reflow at 320 px

Chromium verifies that the catalog, title dialog, administration and 404 page
fit within 320 CSS px.

- Scope: #296, browser regression coverage and the QA ledger.
- Historical regression: local staging `1088e1a` reported a 329 px scroll width
  for a 320 px viewport. PR #376 corrected the header and account panel.
- Verification: seven Chromium tests passed with the production build served
  through `playwright.local-ci.config.ts`. The reflow test opens each screen
  and measures the document scroll width after the screen is visible.
- Pi staging verification: pending deployment.
