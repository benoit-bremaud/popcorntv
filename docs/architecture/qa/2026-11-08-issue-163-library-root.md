# QA — #163 library root checks

Targeted check of the create-time root validation (spec library-management R2, extensions
3a / 3c) on 2026-11-08, branch `fix/163-library-root-validation`, local staging image
`popcorntv:staging-f69a401` on <https://localhost:8443>.

## Scope and limits

- Live owner calls on staging were **not** run: the staging database already holds an owner
  account whose credentials this session does not have, and a throw-away local server was
  declined. The owner replays the "Library root checks (#163)" section of
  `docs/testing/qa-matrix.md` on the next staging pass.
- The behaviour is covered end to end through Fastify `inject` with a real temporary
  `MEDIA_ROOT` (real `stat` / `realpath`, real links), in `apps/server/src/library/routes.test.ts`.

## Results

| Check | Where | Result |
|---|---|---|
| `GET /api/health` | staging | 200 |
| `POST /api/libraries` without a session (missing root body) | staging | 401 `unauthenticated` — the route stays owner-only |
| Missing folder, file, link out of `MEDIA_ROOT`, dangling link | inject tests | 409 `root_unreadable`, nothing stored |
| NUL, newline, tab, DEL, C1 in `rootPath` | inject tests | 400 `invalid_request`, nothing stored |
| NUL, newline, tab, DEL, C1 in `name` on create and on rename | inject tests | 400, old name kept |
| Trailing slash, surrounding whitespace in the name | inject tests | 201, normalised |
| NFC and NFD accented folders, link to a folder inside `MEDIA_ROOT` | inject tests | 201 |
| Unresolvable `MEDIA_ROOT` at scan | scanner test | `RootUnreadableError` (409), not 500 |
| `/etc`, `..` escapes, overlaps | inject tests (unchanged) | 400 / 409 `root_in_use` |

## Follow-ups

- Bidi and zero-width characters (U+202E, U+2066–2069, U+200B) still pass in a name:
  display spoofing only.
- R3 overlap is checked only at creation: a link retargeted later can make two libraries
  index the same files.
