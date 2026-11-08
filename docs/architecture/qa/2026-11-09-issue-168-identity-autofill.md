# QA — issue 168 identity autofill

Staging replay record for #168 (name and search fields opt out of the identity autofill).

- **Date**: 2026-11-09
- **Scope**: `docs/testing/qa-matrix.md` § Identity autofill checks (#168); source finding
  PRI-07 in `2026-11-08-full-pass-pi.md`.
- **Change**: `autocomplete="off"` and a `name` on the catalog and Discover searches, the
  profile name, and the library name, path, rename and delete-confirmation fields; the
  credential fields keep `username`, `current-password` and `new-password`.
- **Status**: pending — the owner deferred the real QA passes; closing #168 covers the markup
  only, unit-tested. Extensions and the browser's own address autofill may still ignore
  `off` (they also read labels and placeholders); checks 1 and 2 decide whether vendor
  opt-outs (`data-1p-ignore`, `data-lpignore`, `data-bwignore`, `data-form-type="other"`)
  are needed — added only if the replay fails (YAGNI).
- **To do**: replay the four checks on local staging (`make staging-up`,
  <https://localhost:8443>) with the extension that raised PRI-07 active (unnamed in the
  full-pass report: ask the owner) during the next
  batch QA pass and record the result here.
