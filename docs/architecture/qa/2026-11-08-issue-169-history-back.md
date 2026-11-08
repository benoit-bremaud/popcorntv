# QA — #169 Back closes the open layer

Targeted check of the #169 fix on 2026-11-08, branch `fix/169-dialog-history-back`.

## Scope

Spec [history-back](../specs/history-back.md) R1–R6. The real-browser replay ran in
Chromium (Playwright, `pnpm e2e`); the in-app browser refused the self-signed staging
certificate, so the replay on https://localhost:8443 with real media goes to the next
Full QA pass (`docs/testing/qa-matrix.md` § Back navigation checks (#169)).

## Results

| Check | Evidence | Result |
|---|---|---|
| Back closes the detail dialog, the app stays | e2e "Back closes the detail dialog…" (`page.goBack()`) | OK |
| Close button leaves no stale entry | same e2e, `history.state` back to `null` | OK |
| Reload on the dialog entry shows the catalog | same e2e, `page.reload()` | OK |
| Player → Back closes the player only, second Back the detail | `history-layer.test.tsx` | OK |
| Double Back at once closes both layers | `history-layer.test.tsx` (`history.go(-2)`) | OK |
| Close by button then Back reopens nothing | `history-layer.test.tsx` | OK |
| Reopen before the close's Back lands stays open | `history-layer.test.tsx` | OK |
| "Play in my library" hand-off reuses the sheet's entry | `history-layer.test.tsx` | OK |
| Escape / button close still work, focus returned | e2e catalog smoke, existing dialog tests | OK |

## Not covered

Phone Back gesture on a real device and the title sheet replay on staging: Full QA pass.
