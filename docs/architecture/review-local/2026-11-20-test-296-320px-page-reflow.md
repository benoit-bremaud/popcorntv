# Local review — page reflow at 320 px

Chromium verifies that the catalog, title dialog, administration and 404 page
fit within 320 CSS px.

- Scope: #296, browser regression coverage and the QA ledger.
- Historical regression: local staging `1088e1a` reported a 329 px scroll width
  for a 320 px viewport. PR #376 corrected the header and account panel.
  [Firefox on Pi staging](https://github.com/benoit-bremaud/popcorntv/issues/296#issuecomment-6994490376)
  had reproduced 333 px of document width at 320 px on `8a3be17`.
- Verification: seven Chromium tests passed with the production build served
  through `playwright.local-ci.config.ts`. The reflow test opens each screen
  and measures the document scroll width after the screen is visible. It also
  checks the title dialog's own bounds and scroll width because modal overflow
  does not contribute to the document width. Administration and the static 404
  have corresponding checks on their content containers.
- Pi staging verification: pending deployment.
