# A11Y-02 recheck — profile picker accessible names (#173)

The "MMe" picker names reported by the 2026-11-08 full pass were a reading artefact, not a
product defect; this note records the analysis, the guard tests and the pending replay.

## Finding under review

`2026-11-08-full-pass-pi.md`, A11Y-02: "picker names read "MMe"" (image `popcorntv:0698684`).

## Analysis

- `apps/web/src/profiles/Avatar.tsx` has rendered the initial with `aria-hidden="true"`
  since #36 (`da3b6e1`); the tested image `0698684` already carried it.
- The accessible name computation (W3C accname 1.2, Chromium, dom-accessibility-api)
  skips `aria-hidden` descendants, so the computed name is "Me". The QA pass most likely
  read the button through `textContent` (the Claude in Chrome page tool), which includes the
  hidden initial; the report does not record the method.
- Existing tests already required the exact name "Me" before the QA run:
  `apps/web/e2e/catalog.smoke.spec.ts:64` (Playwright, real browser and CSS, since #66) and
  `apps/web/src/App.test.tsx:70,86` (since #36). The new component tests repeat that guard
  at the picker level. Playwright and Testing Library use their own accname code, so the
  Chromium accessibility tree is checked in the staging replay.
- Verdict: false positive. No product change.

## Guard

`apps/web/src/profiles/ProfilePicker.test.tsx` (happy: button named "Me" picks the
profile; sad: no "MMe" name, the initial stays `aria-hidden`; edge: RTL + emoji name
intact). Removing `aria-hidden` turns all three red. QA matrix: section "Profile picker
accessible name checks (#173)".

## Staging replay

Pending — to run with the batch QA pass of the UI lot #173–#176 on local staging
(<https://localhost:8443>), reading the DevTools accessibility tree.
