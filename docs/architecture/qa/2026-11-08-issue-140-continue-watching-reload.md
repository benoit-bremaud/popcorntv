# QA — #140 continue watching reload after the last save

Targeted check of the #140 fix on 2026-11-08, branch `fix/140-reload-continue-watching`.

## Scope

The race needs a `PUT …/progress` slower than the dialog close; it cannot be timed by hand
reliably, so it is reproduced deterministically in the page test and the browser checks
are left to the Full QA pass (`docs/testing/qa-matrix.md` § Continue watching checks
(#140)).

## Results

| Check | Evidence | Result |
|---|---|---|
| Row not reloaded while the last save is pending | `CatalogPage.test.tsx` "should reload the row only once the player's last save landed" — fails on `main`'s immediate reload, passes with the fix | OK |
| Row shows the new position once the save lands | same test, `Alien, 75% watched` | OK |
| Close without playing reloads at once | `DetailDialog.test.tsx` "settled save … nothing was played" | OK |
| A stale answer never overwrites a newer row | `CatalogPage.test.tsx` "should keep the newer row when a stale reload answers last" | OK |
| Local prod build smoke | `pnpm e2e` (Playwright, catalog smoke) | OK |

## Not covered

Browser replay with network throttling (matrix checks 1–4): deferred to the next Full QA
pass on staging.
