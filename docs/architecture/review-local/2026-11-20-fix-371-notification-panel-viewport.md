# Local review — notification panel viewport

The notification panel stays inside the header gutters on narrow screens.

- Scope: #371, notification CSS and Chromium catalog checks.
- Baseline: both empty and populated panels started at −69.5 CSS px at a 320 px
  viewport on `f0ce6c3`.
- Fix: position the narrow panel relative to the header and allow unbroken
  notification titles to wrap. The desktop panel remains anchored to the bell.
- Browser evidence: all four Chromium catalog tests passed on the production web
  build. The two panel tests check both edges and text overflow at 320, 390, 768
  and 1280 px.
- Pi staging verification: pending deployment.
