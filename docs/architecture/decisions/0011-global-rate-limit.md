# ADR-0011 — Global HTTP rate limit with @fastify/rate-limit

- Status: accepted (owner chose option A, #72 chat, 2026-11-06)
- Date: 2026-11-06
- Deciders: owner
- Related: spec auth R8 and R13 ([spec](../specs/auth.md)), ADR-0010, issues #72 and #18

## Context

Before the homelab exposure (#60), every route needs a per-client request cap. #18 only
limits the hashing routes with the in-memory `LoginLimiter` (R8), and CodeQL flags them
(`js/missing-rate-limiting`, alerts 14–18) because it only recognises rate-limit plugins.
Two kinds of traffic must never get `429`: media (HLS playlist and segments, direct-play
ranges in bursts on seek, subtitles, the artwork of a whole catalog grid) and the 20 s
playback heartbeat. `request.ip` is already trustworthy: `trustProxy` lists the proxy
addresses only (spec auth §5). Scores 0–5, weights /100, totals /500; scores are
estimates.

## Options

- **A — `@fastify/rate-limit`**, one root `onRequest` hook ahead of the auth hook, media
  routes skipped by `config.rateLimit: false`; `LoginLimiter` kept.
- **B — Extend `LoginLimiter`** into a global hook of our own.
- **C — Reverse proxy only** (a Caddy rate-limit module built with xcaddy).

| Criterion                         | Weight | A                                   | B                              | C                                          |
| --------------------------------- | -----: | ----------------------------------- | ------------------------------ | ------------------------------------------ |
| Real protection                   |     30 | 4 — every API route, tested         | 4 — same coverage              | 3 — nothing locally nor in tests           |
| Closes the CodeQL alerts          |     20 | 5 — recognised plugin               | 0 — false positives stay       | 0                                          |
| KISS / maintenance                |     20 | 4 — official plugin, one config     | 2 — more own code to test      | 3 — custom Caddy build, config out of repo |
| No playback regression            |     20 | 4 — per-route skip, tested          | 4                              | 3 — path filter duplicated in Caddy        |
| Dependency cost                   |     10 | 3 — one official Fastify dependency | 5 — none                       | 4                                          |
| **Total / 500**                   |    100 | **410**                             | 290                            | 250                                        |

Points: A = 120+100+80+80+30 · B = 120+0+40+80+50 · C = 90+0+60+60+40.
Sensitivity: with the CodeQL criterion at 0 (its weight moved to protection) A ≈ 390,
B ≈ 370; A stays first. **A.**

## Decision

A. The plugin is registered with `global: false` and `app.rateLimit()` is added as the
first root `onRequest` hook: route-level hooks would run after the auth hook and let an
unauthenticated flood through as cheap `401`s. 300 requests per client per minute
(browsing the API sends a few dozen); `buildApp` became async to await the plugin.
The `429` body is `{ error: 'too_many_requests' }` with `Retry-After`.

## Consequences

- Media routes are unlimited for a signed-in client; their cost is bounded by the
  session check and the transcode cap (ADR-0006).
- The counter lives in memory, one process, reset on restart, like R8.
- CodeQL alerts 14–18 are re-evaluated on the merged code.
