# Local review — signed-in header on narrow screens

With an active profile, the catalog header fits a 320 CSS px viewport.

- Scope: #372, signed-in header layout, profile and account control sizing, and Chromium tests.
- Baseline: both 320 px regressions on `6aa68ac` measured a 16 px wide profile switch.
- With an active profile and a viewport narrower than 24rem, the brand has its own row.
  The profile switch, bell and account trigger share the next row, each with a
  target of at least 44 × 44 CSS px at the default browser font size.
- Opening the account menu on `c3c7245` placed its left edge at −10 px in Chromium
  and Firefox. The panel width now includes padding and borders.
- Verification: six Chromium catalog tests passed on the production web build.
  The header tests cover 320 and 390 px, short and long account names, the profile's
  accessible name, pointer actionability, and closed and open panel bounds.
  Run the web build and use the `playwright.local-ci.config.ts` configuration, which
  serves the built files through Vite preview.
- Pi staging verification: pending deployment.
