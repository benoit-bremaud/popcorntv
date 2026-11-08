# QA — #174 readable device label

Staging replay of the #174 device label, pending the batch QA pass of the UI lot #173–#176.

## Scope

- Change: the admin device list shows `deviceLabel(userAgent)` ("Chrome on Linux") with the
  raw User-Agent as a tooltip and as the fallback for an unknown agent (USA-06,
  `2026-11-08-full-pass-pi.md`).
- Checks: `docs/testing/qa-matrix.md` § Device label checks (#174).

## Status

| Check | Result | Evidence |
|---|---|---|
| Unit: `deviceLabel` happy / sad / edge | Pass | `apps/web/src/auth/device-label.test.ts` |
| Component: label, tooltip, "Unknown device" | Pass | `apps/web/src/auth/AdminPanel.test.tsx` |
| Staging replay on <https://localhost:8443> (checks 1–4) | Pending | batch QA pass after #176 |
