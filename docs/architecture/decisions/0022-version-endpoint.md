# ADR-0022 — Running version through a signed-in `GET /version`

- Status: accepted (brick #162, owner approval 2026-11-08)
- Date: 2026-11-08
- Deciders: owner
- Related: spec [app-version](../specs/app-version.md), ADR-0010, ADR-0013, issues #162, #92

## Context

The owner wants to see which build runs in prod. The only version on hand was
`npm_package_version`, always `0.0.0` in the image, and it leaked on the public
`GET /health` (#92). The version is baked at `docker build` (`APP_VERSION` build argument)
and must reach the web app without being public.

## Options

A — a signed-in `GET /version`; B — a Vite constant baked into the web bundle as well;
C — a `version` field on the session answer (`/auth/status`).

| Criterion                          | Weight | A                       | B                              | C                              |
| ---------------------------------- | -----: | ----------------------- | ------------------------------ | ------------------------------ |
| Web and server show the same value |     30 | 5 — read from the server | 3 — two injections to align   | 5 — read from the server       |
| Not public (#92)                   |     25 | 5 — signed-in only      | 3 — in the public JS bundle    | 5 — signed-in part only        |
| Simplicity                         |     20 | 4 — one route           | 4 — a `define` + build arg     | 4 — one field                  |
| Separation of concerns             |     15 | 5 — own route           | 4 — build concern in the web   | 2 — mixes identity and build   |
| Testability                        |     10 | 5 — one inject test     | 3 — build-time only            | 4 — status tests grow          |
| **Total**                          |    100 | **480**                 | **335**                        | **425**                        |

By hand: A = 150 + 125 + 80 + 75 + 50 = 480; B = 90 + 75 + 80 + 60 + 30 = 335;
C = 150 + 125 + 80 + 30 + 40 = 425 — the chat matrix read 435, a sum slip; the ranking is
unchanged. Sensitivity: with separation of concerns at 0, A (405) still leads C (395); B stays
last for any weight on simplicity.

## Decision

A. `APP_VERSION` build argument → `ENV`, validated by `loadConfig`; `/health` drops the
version; `GET /version` has no `access` key, so the auth hook lets any signed-in caller in.

## Consequences

- An image built without the argument reports `dev`, which is visible and harmless.
- A release tag shows as the tag; between tags `git describe` shows `vX-N-gSHA`.
- Uptime probes keep using `/health`; nothing reads the version from it any more.
