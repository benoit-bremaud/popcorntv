# ADR-0025 — Real 404 for unknown paths, answered by Caddy

- Status: accepted (brick #177, owner approval 2026-11-08)
- Date: 2026-11-08
- Deciders: owner
- Related: spec [deploy-homelab](../specs/deploy-homelab.md) R3a, ADR-0013, ADR-0024,
  issues #177, #91

## Context

Both Caddy site blocks ended in `try_files {path} /index.html`: `/nope`, `/.env`,
`/.git/config` answered `200` with the SPA shell, which hides scan noise and lies to
probes. Caddy matches on the decoded, cleaned path, so `/api/artwork/..%2f..%2fetc%2fpasswd`
left `handle_path /api/*` and also got HTML. The app has no client routes (layers are
history state, ADR-0024; auth links use the hash on `/`).

## Options

A — Caddy: no `index.html` fallback, `handle_errors 404` serves a static `404.html` (second
Vite entry), a raw-path matcher answers JSON for `/api…`;
B — Fastify serves the web build and the 404 (moves static serving out of Caddy);
C — a client-side not-found view (still `200`).

## Decision matrix

| Criterion (weight) | A | B | C |
|---|---|---|---|
| Meets the issue: real 404, no HTML under /api (35) | 5 | 5 | 0 |
| Staging / Pi parity (20) | 5 | 2 | 5 |
| Simplicity (20) | 4 | 1 | 5 |
| Testability (15) | 4 | 4 | 3 |
| User experience (10) | 4 | 4 | 4 |
| **Total /500** | **455** | **335** | **285** |

Sensitivity: with simplicity at 40, A still leads; C never meets the issue.

## Decision

A. `handle` keeps `file_server` only, guarded by `@missing not file {path}
{path}index.html` → `error 404` (a path under a file would otherwise be a bare `400`);
`handle_errors 404` rewrites to `/404.html`; `@rawApi` on `{http.request.orig_uri.path}`
answers `404 {"error":"not_found"}`. `scripts/not-found-check.sh` is the executable matrix.

## Consequences

- The Pi needs the homelab Caddyfile copied into bb-homelab on the next owner deploy (the
  reference block lives in this repo).
- A future client route needs an explicit Caddy rule.
- The Vite dev server keeps its own SPA fallback (dev only).
