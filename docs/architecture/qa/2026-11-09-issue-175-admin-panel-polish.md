# QA — #175 Administration panel polish

Staging replay of the #175 admin panel polish, pending the batch QA pass of the UI lot #173–#176.

## Scope

- Change: ISO 8601 dates with the offset, "1 device" / "n devices", one box model and
  left-packed form rows, and a revoke reset action disabled without a pending link
  (`Account.resetPending`) with feedback after it (UI-06, USA-06,
  `2026-11-08-full-pass-pi.md`).
- Checks: `docs/testing/qa-matrix.md` § Administration panel polish checks (#175).

## Status

| Check | Result | Evidence |
|---|---|---|
| Unit: `formatDateTime`, `deviceCount` happy / sad / edge | Pass | `apps/web/src/auth/admin-format.test.ts` |
| Server: `pendingResetUsers`, `GET /users` `resetPending` | Pass | `token-repository.test.ts`, `user-routes.test.ts` |
| Component: revoke disabled, confirmed, refused, plural | Pass | `apps/web/src/auth/AdminPanel.test.tsx` |
| Label alignment in Chromium at 1440 px (check 3, static page with the app CSS) | Pass | Folder, Name, Kind labels all at top 32 px |
| Staging replay on <https://localhost:8443> (checks 1–5) | Pending | batch QA pass after #176 |
