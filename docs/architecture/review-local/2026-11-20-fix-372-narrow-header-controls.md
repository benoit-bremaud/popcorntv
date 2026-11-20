# Local review — signed-in header on narrow screens

The signed-in header fits a 320 px viewport and exposes three usable controls.

- Scope: #372, signed-in header layout, profile and account control sizing, and Chromium tests.
- Baseline: both 320 px regressions on `6aa68ac` measured a 16 px wide profile switch.
- Below 384 CSS px, the brand has its own row and the profile switch, bell and account
  trigger share the next row. Each control has a minimum 44 px tap target.
- Verification: six Chromium catalog tests passed on the production web build.
  The header tests cover 320 and 390 px, short and long account names, the profile's
  accessible name, and document overflow.
- Pi staging verification: pending deployment.
