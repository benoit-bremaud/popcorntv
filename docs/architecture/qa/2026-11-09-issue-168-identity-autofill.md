# QA — issue 168 identity autofill

Staging replay record for #168 (name and search fields opt out of the identity autofill).

- **Date**: 2026-11-09
- **Scope**: `docs/testing/qa-matrix.md` § Identity autofill checks (#168); source finding
  PRI-07 in `2026-11-08-full-pass-pi.md`.
- **Change**: `autocomplete="off"` and a `name` on the catalog and Discover searches, the
  profile name, and the library name, path, rename and delete-confirmation fields; the
  credential fields keep `username`, `current-password` and `new-password`.
- **Status**: pending — the owner deferred the real QA passes; the attributes are covered
  by unit tests only, and an extension's own heuristics can still ignore `off`.
- **To do**: replay the four checks on local staging (`make staging-up`,
  <https://localhost:8443>) with a password manager active during the next batch QA pass and
  record the result here.
