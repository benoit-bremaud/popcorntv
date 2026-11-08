# Logging policy

Cross-cutting concept (arc42 §8) for every server log line: levels, event names, fields,
redaction and the coverage check. Issue #182, ADR-0021.

## 1. Why

On the Raspberry Pi the logs are the only debugging tool: bug #178 was found by reading
them. The 2026-11-08 FULL QA pass found 18 log calls in 9 of ~50 server files, and
`LOG_LEVEL` ignored.

## 2. Rules

- **R1 — level.** `LOG_LEVEL` (`fatal`, `error`, `warn`, `info`, `debug`, `trace`,
  `silent`, case-insensitive, default `info`) sets the pino level. An unknown value stops
  the start.
- **R2 — levels.** `error`: a server fault someone must fix (5xx, FFmpeg cannot start, a
  directory not removed). `warn`: degraded but handled (TMDB or ffprobe failure, file
  skipped, FFmpeg crash, a refused login, CSRF, 403, 429). `info`: one line per domain
  event (scan, enrichment, playback decision, session lifecycle, audit event, request).
  `debug`: high-volume lines (media requests, FFmpeg normal exit).
- **R3 — requests.** Fastify's two request lines are replaced by one `http.request` line
  per answer: `method`, `path` (never the query string), `status`, `ms`, `userId`. 5xx
  are logged by the error handler; 403 and 429 at `warn`; other 4xx at `info`; media
  routes (`rateBucket: 'media'`) at `debug` when they succeed.
- **R4 — never logged.** Passwords, session tokens, invitation or reset tokens, cookies,
  `Authorization` headers, the TMDB key, the username typed at a failed login. pino
  `redact` masks `cookie`, `authorization`, `set-cookie`, `password` and `token` wherever
  a call site puts them. Exception: the one-time setup link (ADR-0010), printed on purpose
  while no account exists. Client IPs are logged on audit events only, as in `auth_events`.
  Media paths are the owner's own files and may be logged.
- **R5 — event lines.** Each domain line carries `event: "<domain>.<action>"` and the IDs
  it is about (`libraryId`, `mediaId`, `session`, `userId`). The message is a short, fixed
  English text, never built from data. Errors go in `err`.
- **R6 — audit events.** Every `auth_events` row is also logged as `auth.<kind>` with
  `userId` and `ip`, by `EventRepository.record` itself (ADR-0021). `login_failed` and
  `login_locked` are logged at `warn`, the other kinds at `info`.
- **R7 — coverage.** `scripts/log-coverage.mjs`, run by `pnpm lint`, refuses a `catch` in
  `apps/server/src` that does not log, rethrow or carry `// log: n/a — <reason>`.
- **R8 — tests.** Each event of the catalog is asserted by a test, either on an injected
  logger spy or by capturing the app's lines through `loggerOptions(level, stream)`.

## 3. Event catalog

| Event                                                     | Level        | Fields                                                  | Where                  |
| --------------------------------------------------------- | ------------ | ------------------------------------------------------- | ---------------------- |
| `server.config`                                           | info         | `logLevel`, `scanIntervalMin`                           | `index.ts`             |
| `http.request`                                            | R3           | `method`, `path`, `status`, `ms`, `userId`              | `logging.ts`           |
| `auth.<kind>`                                             | R6           | `userId`, `ip`                                          | `event-repository.ts`  |
| `auth.csrf_refused`                                       | warn         | `origin`, `fetchSite`                                   | `auth/hook.ts`         |
| `library.scan.start`                                      | info         | `libraryId`                                             | `library/routes.ts`    |
| `library.scan.skipped`                                    | warn         | `libraryId`, `path`, `reason`                           | `library/routes.ts`    |
| `library.scan.done`                                       | info         | `libraryId`, `added`, `updated`, `removed`, `skipped`, `ms` | `library/routes.ts` |
| `metadata.enrich.skipped`                                 | warn         | `libraryId`, `err`                                      | `library/routes.ts`    |
| `metadata.unmatched`                                      | info         | `mediaId`, `title`, `year`                              | `metadata/service.ts`  |
| `metadata.lookup.failed`                                  | warn         | `mediaId`, `title`, `err`                               | `metadata/service.ts`  |
| `metadata.artwork.failed`                                 | warn         | `size`, `path`, `err`                                   | `metadata/service.ts`  |
| `metadata.season.failed`                                  | warn         | `tmdbId`, `season`, `err`                               | `metadata/service.ts`  |
| `metadata.enrich.done`                                    | info         | `libraryId`, `refresh`, `matched`, `unmatched`, `failed`, `skipped`, `ms` | `metadata/service.ts` |
| `playback.decision`                                       | info         | `mediaId`, `mode`, `browserDirect`, `defaultTrack`, `startSec` | `session-routes.ts` |
| `playback.session.opened`                                 | info         | `session`, `userId`, `startSec`, `audioIndex`           | `session-manager.ts`   |
| `playback.session.takeover`                               | info         | `session`, `victimOwner`, `victimRole`, `by`            | `session-manager.ts`   |
| `playback.session.not_ready`                              | warn         | `session`, `exited`                                     | `session-manager.ts`   |
| `playback.session.closed`                                 | info         | `session`, `reason` (`stopped`, `idle`, `crash`, `takeover`, `not_ready`, `shutdown`) | `session-manager.ts` |
| `playback.ffmpeg.exit`                                    | debug        | `session`, `code`                                       | `session-manager.ts`   |
| `playback.ffmpeg.failed`                                  | warn         | `session`, `code`, `stderrTail`                         | `session-manager.ts`   |
| `playback.ffmpeg.spawn_failed`                            | error        | `err`                                                   | `session-manager.ts`   |
| `playback.session.cleanup_failed`                         | error        | `dir`, `err`                                            | `session-manager.ts`   |

The scheduled scan keeps its own lines (spec scheduled-scan) and also emits the
`library.scan.*` lines through `scanLibrary`. Management actions (libraries, accounts,
profiles, links) are traced by their `http.request` line, which names the caller.

## 4. Sink

stdout (JSON lines, one per event) → Docker's log driver → the host (`docker logs`). No
file and no log shipper inside PopCornTV.
