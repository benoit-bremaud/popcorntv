# UC11–UC20 — Accounts, sign-in and household administration

> **Feature**: Accounts — [use cases](../diagrams/auth/01-use-case.md),
> [sign-in sequence](../diagrams/auth/02-sequence-sign-in.md),
> [setup / invite / reset sequence](../diagrams/auth/02-sequence-invite-and-accept.md),
> [components](../diagrams/auth/03-component.md), [classes](../diagrams/auth/04-class.md),
> [session states](../diagrams/auth/05-state-session.md),
> [deployment](../diagrams/auth/08-deployment-prod.md)
> **Issue**: #18 · **Related ADRs**: ADR-0010, ADR-0008 (§4 superseded)
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** Every route requires a valid session unless it declares `config: { access:
  'public' }`; owner routes declare `access: 'owner'`. A route without the option is
  protected (viewer or owner). The hook reads the matched route's config, never the URL
  string; an unmatched URL answers `401` before `404` (§4.3). On a public route the hook
  still resolves a session cookie when present, so `GET /auth/status` can return the
  user.
- **R2** Roles: `owner` (everything) and `viewer` (browse, play, own profiles). At least
  one owner always exists. The hook reads the user's current role on every request, so a
  role change or a deletion applies at once.
- **R3** Accounts are created only by `POST /auth/setup` (first owner) or by redeeming an
  owner-issued invitation (ADR-0010 §1, §4). There is no public sign-up.
- **R4** Passwords: 12–128 characters after NFC normalisation, hashed with argon2id
  (memory 19 MiB, 2 passes, 1 lane), verified with a dummy hash for unknown users. No
  composition rules, no truncation. At most 4 hashes run at once; a request waits up to
  2 s for a slot, then answers `429 too_many_attempts`.
- **R5** Sessions are server-side rows; the cookie carries a 256-bit random token, the
  database its SHA-256. Idle expiry 14 days, absolute 90 days. Every sign-in, setup or
  redeem issues a new token and revokes the session the request carried, if any (no
  session fixation); each of them also sets `users.last_login_at`. A password change
  rotates the current session's token too. At most 20 active sessions per user; the
  oldest is revoked first. Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`; on `https` it is
  named `__Host-pctv_session` and `Secure`, on `http` (dev) `pctv_session`.
- **R6** `PUBLIC_URL` is required; the server refuses to start without it. Dev value:
  `http://localhost:5173` (the Vite origin). Every client, LAN included, uses that
  origin (through the proxy in production). It drives the cookie flags (R5), the CSRF
  check (R7) and the links (§4.2).
- **R7** A request other than GET, HEAD or OPTIONS is refused with `403 csrf` when `Sec-Fetch-Site` is
  `cross-site`, or when an `Origin` header is present and differs from `PUBLIC_URL`'s
  origin. GET routes have no security-relevant side effect (only keep-alive and cache
  fills).
- **R8** Rate limits, in memory (reset on restart, one process): 5 failures per
  (IP, submitted username key) per 15 min, whether or not the account exists; 30
  failures per IP per 15 min across every route that runs the hasher (`/auth/session`,
  `/auth/setup`, `/auth/redeem`, `PUT /auth/password`). A success clears the pair.
  An attempt counts before the hash runs and a success refunds it, so concurrent tries
  cannot all pass the check; a busy hasher (`429`) gave no verdict and refunds it too, as
  does a redeem refused for a taken username. A redeem token that is not pending is
  counted without being hashed, and a reset redeem lifts that account's lockout from the
  redeeming address; an IPv6 address counts by its /64.
  The pair key means a stranger cannot lock the owner out from the owner's own address.
  Sign-in and `PUT /auth/password` failures answer the same `401 invalid_credentials`
  (setup and redeem answer `404 token_invalid`); a limit answers `429` with
  `Retry-After`. Several cookies of the session name (another app on the same http host
  can shadow it) are each tried, at most four.
- **R9** `auth_events` records sign-in success and failure, the first refusal of each
  lockout window, first-owner setup, sign-out, invitation and reset issue and
  revocation, redeem, password change, sessions ended by the owner, role change and
  deletion. `user_id` is the account acted on; invitations and deletions, which leave
  none, record the acting owner (null when an owner deletes their own account). No
  password, no token; `username_tried` only on failures and only when it names an existing
  account (a password typed into the username field is never stored). Rows older than 90 days are
  purged.
- **R10** A profile belongs to one user. Name uniqueness, the 12-profile limit and the
  last-profile rule are per user; another user's profile answers `404
  profile_not_found` (ADR-0010 §5). Playback sessions belong to the user who opened
  them; another user gets `404 session_not_found`.
- **R11** Remote access: Caddy serves the web build and proxies `/api` to Fastify, which
  is never published (§5, deployment diagram).
- **R12** Done when: unit and route tests for every rule above (coverage ≥ 80 %), a test
  proving every non-public route answers `401` without a session, a security review and
  a QA pass recorded under `docs/architecture/qa/` (SEC-01…SEC-12 and SEC-15).
- **R13** Global rate limit (#72, ADR-0011): every request counts against its client
  (`request.ip`, so `X-Forwarded-For` only from a `TRUST_PROXY` address; IPv6 by its
  /64 through `clientKey`), in memory, per minute: 300 in the API bucket, 3000 in the
  media bucket. The check runs before the auth hook, so unauthenticated and unmatched
  requests count too. Past the limit: `429 too_many_requests` with `Retry-After`; the
  remaining budget is not advertised on other answers. The media bucket (`MEDIA_ROUTE`)
  holds `GET /media/:id/file`, `GET /media/:id/subtitles/:index`, `GET /artwork/:file`,
  `GET /playback/sessions/:id/:file`, `POST /playback/sessions/:id/heartbeat` and `GET
  /health` (Docker probe): a player or the catalog grid sends them in bursts, while a
  flood of forged cookies stays capped. R8 stays the per-username guard of the hashing
  routes.

## 2. UC11 — Set up the first owner

Primary actor: Owner. Trigger: the owner opens a fresh install.

1. While no user exists, the server keeps a setup token in memory (SHA-256 + expiry
   1 h) and prints the raw token once in its log with the setup URL; a new one at each
   start replaces the previous one.
2. The web, seeing `GET /auth/status` → `{ setupRequired: true }`, shows the setup form.
3. The owner submits token, username and password. In one transaction: the account is
   created with role `owner` (only if no user exists), every profile without an owner
   is adopted, a session starts.

Extensions: 3a token wrong or expired → `404 token_invalid`; 3b a user already exists →
`404 not_found`; 3c invalid input → `400`.

## 3. Other use cases

- **UC12 Accept an invitation** (Invited person): opens `#/invite/<token>`, picks a
  username and a password; gets the invited role, a first profile named after the
  username, and a session. Extensions: token used / expired / revoked / unknown → `404
  token_invalid`; username taken → `409 username_taken` and the token stays usable.
- **UC13 Sign in** (Viewer, Owner): username + password → session cookie. Extensions:
  `401 invalid_credentials`; `429 too_many_attempts` with `Retry-After`.
- **UC14 Sign out**: this device (`DELETE /auth/session`) or every device
  (`DELETE /auth/sessions`).
- **UC15 Invite a person** (Owner): chooses a role, gets a link valid 72 h, shown once;
  lists pending invitations and revokes one.
- **UC16 Reset a person's password** (Owner): issues a reset link valid 24 h for that
  account; a new reset link revokes the previous one; the owner can revoke it.
- **UC17 Manage accounts** (Owner): lists users with their last sign-in
  (`users.last_login_at`, kept beyond the 90-day event purge) and active devices,
  changes a role, ends a device's or all sessions, deletes an account. Changing a role
  or deleting revokes that user's pending reset link; demoting or deleting an owner
  revokes every pending invitation and reset link, since links do not record who issued
  them and a former owner must not keep one. Extension: removing or demoting
  the last owner → `409 last_owner`.
- **UC18 Review sign-in activity** (Owner): last 200 `auth_events`, newest first.
- **UC19 Change my password** (Viewer, Owner): current + new password; every other
  session of that user ends, the current one gets a new token (R5) and a pending reset
  link of that account is revoked. Extension: wrong
  current → `401 invalid_credentials`.
- **UC20 Set a new password from a reset link** (Viewer, Owner): opens
  `#/reset/<token>`, picks a password; every session of that user ends and a new one
  starts. Extension: token invalid → `404 token_invalid`.

## 4. Data rules

### 4.1 Storage

- `users`: `id` (UUID), `username`, `username_key` (lower-cased, unique),
  `password_hash`, `role` (`owner` | `viewer`), `created_at`, `last_login_at`.
- `sessions`: `id` (UUID, used to end one device), `user_id` (FK cascade), `token_hash`
  (unique), `created_at`, `last_seen_at`, `expires_at` (= `created_at` + 90 days, the
  absolute limit; the idle limit is `last_seen_at` + 14 days), `revoked_at`,
  `user_agent` (truncated to 200, shown in UC17). `last_seen_at` is written at most once
  per hour per session.
- `auth_tokens`: `id`, `token_hash` (unique), `kind` (`invite` | `reset`), `role`
  (invites), `user_id` (resets; FK cascade), `expires_at`, `used_at`, `revoked_at`. The
  setup token is never stored (UC11).
- `auth_events`: `id` (autoincrement), `at`, `kind` (see the class diagram), `user_id`
  (nullable, SET NULL), `ip`, `username_tried`.
- `profiles.user_id`: nullable column, FK `users.id` cascade. It is null only between
  migration `0006` and setup, when no route is reachable; the repository never writes
  null. The unique index becomes `(user_id, name_key)`.
- Username: 3–32 ASCII characters `[A-Za-z0-9._-]`, unique case-insensitively.
- Purge: expired or revoked sessions, used, revoked or expired tokens, and events older
  than 90 days are deleted at start and on each successful sign-in.
- Setup and redeem run in one transaction. A token is consumed with `UPDATE auth_tokens
  SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND
  kind = ? AND expires_at > ?`, which must change exactly one row; any later failure
  rolls it back. better-sqlite3 transactions are synchronous, so the password is hashed
  before the transaction opens, never inside it.

### 4.2 Auth API

Paths are Fastify routes; the browser reaches them under `/api` (§5).

| Route | Access | Answer |
| --- | --- | --- |
| `GET /auth/status` | public | `{ setupRequired, user? }` |
| `POST /auth/setup` `{ token, username, password }` | public, once | `201 User` + cookie |
| `POST /auth/redeem` `{ kind: 'invite', token, username, password }` | public | `200 User` + cookie |
| `POST /auth/redeem` `{ kind: 'reset', token, password }` | public | `200 User` + cookie |
| `POST /auth/session` `{ username, password }` | public | `200 User` + cookie |
| `DELETE /auth/session` · `DELETE /auth/sessions` | session | `204` |
| `PUT /auth/password` `{ current, next }` | session | `204` + cookie (rotated token) |
| `GET /users` · `PATCH /users/:id` `{ role }` · `DELETE /users/:id` | owner | list · `200` · `204` |
| `GET /users/:id/sessions` · `DELETE /users/:id/sessions[/:sessionId]` | owner | list · `204` |
| `POST /users/:id/reset` · `DELETE /users/:id/reset` | owner | `201 { link, expiresAt }` · `204` |
| `POST /invitations` `{ role }` · `GET /invitations` · `DELETE /invitations/:id` | owner | `201 { link, expiresAt }` · pending list · `204` |
| `GET /auth/events` | owner | `200 AuthEvent[]` |

A redeem whose `kind` differs from the token's answers `404 token_invalid`. Links are
`PUBLIC_URL/#/invite/<token>` and `PUBLIC_URL/#/reset/<token>`: the token sits in the
fragment, never sent to a server, a proxy log or a `Referer`, and is posted in the body.

### 4.3 Public routes

`GET /health`, `GET /auth/status`, `POST /auth/setup`, `POST /auth/redeem`,
`POST /auth/session`. Fastify serves no web assets (§5). A request matching no route
answers `401` without a session, so the route map is not probeable.

### 4.4 Roles on existing routes

- Owner only: `POST /libraries`, `GET /libraries/folders`, `PATCH|DELETE /libraries/:id`,
  `POST /libraries/:id/scan`, `POST /libraries/:id/enrich` (spec library-management), and
  the user and invitation routes.
- Viewer and owner: `GET /libraries`, `GET /libraries/:id/media`, `GET /media…` (file, subtitles), `GET
  /artwork/:file`, `/playback/sessions…` (own sessions only), the profile and progress
  routes for their own profiles (UC9 for every user, ADR-0010 §5).
- `GET /libraries` keeps exposing `rootPath` to viewers: the household already knows the
  server; revisit with the security audit after #18.

### 4.5 Code layout

`src/auth/` (flat): `hasher` (only module importing argon2), `user-repository`,
`session-repository`, `token-repository`, `event-repository`, `limiter`, `hook`,
`routes` (public and self-service), `user-routes` (owner administration). The caller
type `Caller { userId, role }` and its `FastifyRequest` augmentation live in
`src/http.ts`, so `profiles`, `progress` and `playback` never import `auth`; `auth`
receives `Pick<ProfileRepository, 'adoptOrphans' | 'createFirst'>`.

## 5. Remote-access recipe

- Caddy terminates HTTPS, proxies the API with the prefix stripped and serves the web
  build (copied to `/srv/web`) for every other path. Order matters: `try_files` at top
  level would rewrite `/api/…` to `index.html` first, so both live in `handle` blocks:

  ```caddyfile
  handle_path /api/* {
    reverse_proxy popcorntv:3000
  }
  handle {
    root * /srv/web
    try_files {path} /index.html
    file_server
  }
  ```

  One origin for both, so CORP `same-origin` holds and
  the cookie accompanies `<video>`, `<img>` and `<track>`.
- Caddy sets `Strict-Transport-Security: max-age=31536000`, `X-Frame-Options: DENY`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Cross-Origin-Opener-Policy: same-origin` and a CSP on the web build
  (`frame-ancestors 'none'`; details in #46) with `header` directives. Fastify answers
  `Cache-Control: no-store` unless a route sets its own policy (artwork).
- Fastify listens on `0.0.0.0` inside the container on a private Docker network shared
  with Caddy; the compose file publishes no port (or `127.0.0.1:3000:3000` for local
  dev). The `HEALTHCHECK` on `127.0.0.1:3000` keeps working.
- `PUBLIC_URL=https://…`; `TRUST_PROXY=<Caddy's address>` (a fixed `ipv4_address` in
  compose; comma-separated for several, a CIDR only for a network that holds Caddy and
  the app alone) so the limiter reads the client IP from `X-Forwarded-For`, and only when
  the socket peer is in that list: another container or a local process cannot forge it
  (QA 2026-11-06: a sibling container inside a trusted CIDR could). `1` or `true` refuse to start. With an `https`
  `PUBLIC_URL` and no `TRUST_PROXY` the server logs a warning: every client would share
  the proxy's address and one stranger could lock the household out (R8).

## 6. Error shape

`{ error: '<code>' }`: `unauthenticated` (401), `forbidden` (403), `csrf` (403),
`invalid_credentials` (401), `too_many_attempts` (429), `too_many_requests` (429, R13), `token_invalid` (404),
`username_taken` (409), `last_owner` (409), `not_found` (404), `profile_not_found`
(404), `session_not_found` (404).

## 7. Out of scope here (follow-up issues)

1. Email: address verification, email change, reset by email, SMTP configuration.
2. Optional TOTP second factor with recovery codes.
3. Homelab deployment and the Caddy files in the infrastructure repository.

## 8. Test plan

- Unit: hasher (hash, verify, dummy, concurrency cap), token generation and hashing,
  limiter windows (existing and unknown usernames reach `429` alike), username and
  password validation (NFC, ASCII), CSRF predicate table (`Origin` /
  `Sec-Fetch-Site`), config refuses a missing `PUBLIC_URL`.
- Repositories (in-memory SQLite): session idle / absolute expiry and hourly slide,
  revoke, the 20-session cap, single-use and revoked tokens, concurrent redeem (one
  wins), last-owner invariant, profile adoption, per-user profile rules, cascades,
  purge.
- Routes (`app.inject`): setup once, invite → redeem, reset → redeem, kind mismatch,
  username taken keeps the token, sign-in/out, a pre-set cookie is replaced at sign-in,
  a password change rotates the cookie and the old token gets `401`, lockout, no
  enumeration (same status and body), every non-public route `401` without a cookie
  (built from the route table), `403` for a viewer on owner routes, role change
  applies at once, cross-user profile and playback session → `404`, CSRF `403`.
- Global limit (R13, `app.test.ts`): `429` with `Retry-After` past the limit, unmatched,
  unauthenticated and signed-in requests counted, one bucket per client and per IPv6
  /64, media routes burst past the API limit without spending it, a media flood without
  a session capped, `X-Forwarded-For` honoured only from a trusted proxy.
- Web: setup, sign-in, invite and reset screens, users and invitations panel, `401` →
  sign-in.
- Security: gitleaks, SEC-01…SEC-12 and SEC-15 (skill `qa-browser-check`).
