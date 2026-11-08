# QA — issue 172 title dialog actions

Staging replay record for #172 (one action row, one button shape, one cast label, a 44 px close).

- **Date**: 2026-11-09
- **Scope**: `docs/testing/qa-matrix.md` § Title dialog action checks (#172); source findings
  UI-07, USA-06 and A11Y-05 in `2026-11-08-full-pass-pi.md`.
- **Change**: the watched toggle joins `.detail__actions`; every `.button` and `.chip` of that
  row is a `--radius-pill` pill at least `--touch-target` (44 px) high; `.detail__close` is
  44×44 px; the Discover sheet labels its cast "Cast:" like the library dialog.
- **Status**: pending — the owner deferred the real QA passes; the row order and the cast
  label are unit-tested, the measured sizes and alignment need the replay.
- **To do**: replay the six checks on local staging (`make staging-up`,
  <https://localhost:8443>) during the next batch QA pass and record the result here.
