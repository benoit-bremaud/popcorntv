# UC11–UC18 — Accounts, sign-in and household administration

> **Feature**: Accounts — [use cases](../diagrams/auth/01-use-case.md),
> [sign-in sequence](../diagrams/auth/02-sequence-sign-in.md),
> [invite / setup sequence](../diagrams/auth/02-sequence-invite-and-accept.md),
> [components](../diagrams/auth/03-component.md), [classes](../diagrams/auth/04-class.md),
> [session states](../diagrams/auth/05-state-session.md)
> **Issue**: #18 · **Related ADRs**: ADR-0010, ADR-0008
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** Every route requires a valid session except the public list in §4.3. A new
  route is protected by default.
- **R2** Roles: `owner` (everything) and `viewer` (browse, play, own profiles). At least
  one owner always exists.
- **R3** Accounts are created only by `POST /auth/setup` (first owner) or by redeeming an
  owner-issued invitation (ADR-0010 §1, §4). There is no public sign-up.
- **R4** Passwords: 12–128 characters, hashed with argon2id (memory ≥ 19 MiB, 2 passes,
  1 lane), verified in constant work for unknown users (dummy hash). No composition
  rules, no truncation.
- **R5** Sessions are server-side rows; the cookie carries a 256-bit random token, the
  database its SHA-256. Idle expiry 14 days (sliding), absolute 90 days. Cookie
  `pctv_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` when `PUBLIC_URL` is
  `https`.
- **R6** Non-GET requests are refused with `403 csrf` when `Sec-Fetch-Site` is
  `cross-site`, or when `Origin` is present and differs from `PUBLIC_URL`'s origin
  (ADR-0010 §3).
- **R7** Login is rate-limited per (IP, username) and per IP; failures answer the same
  `401 invalid_credentials` whether the user exists or not.
- **R8** Every sign-in outcome, sign-out, invitation, reset, role change and deletion is
  written to `auth_events` (no passwords, no tokens); events older than 90 days are
  purged.
- **R9** A profile belongs to one user; progress routes and profile routes only reach
  the caller's profiles (ADR-0010 §5).
- **R10** Remote access is documented and tested as a recipe: Caddy terminating HTTPS,
  Fastify bound to loopback / a private network, never published directly (§5).
- **R11** Done when: unit and route tests for every rule above (coverage ≥ 80 %), a
  route-by-route test proving 401 without a session, a security review and a QA pass
  (SEC probes) recorded under `docs/architecture/qa/`.

## 2. UC11 — Set up the first owner

Primary actor: Owner. Trigger: first start with no user.

1. At start the server finds no user, creates a `setup` token (1 h) and prints it once
   in the log with the setup URL.
2. The web, seeing `GET /auth/status` → `{ setupRequired: true }`, shows the setup form.
3. The owner submits token, username and password; the account is created with role
   `owner`, existing profiles are adopted, a session starts.

Extensions: 3a token wrong or expired → `404 token_invalid`; 3b a user already exists →
`404 not_found` (the endpoint is gone); 3c weak or invalid input → `400`. A new token is
issued at each start while no user exists.

## 3. Other use cases

- **UC12 Accept an invitation** (Invited person): opens the link, picks a username and a
  password, gets an account with the invited role, a first profile and a session.
  Extensions: token used / expired / unknown → `404 token_invalid`; username taken →
  `409 username_taken`.
- **UC13 Sign in** (Owner, Viewer): username + password → session cookie. Extensions:
  wrong credentials → `401 invalid_credentials`; locked out → `429 too_many_attempts`
  with `Retry-After`.
- **UC14 Sign out**: this device (`DELETE /auth/session`) or every device
  (`DELETE /auth/sessions`).
- **UC15 Invite a person** (Owner): chooses a role, gets a one-time link valid 72 h,
  shown once.
- **UC16 Reset a person's password** (Owner): issues a `reset` link for that account;
  redeeming it sets the password and revokes all that user's sessions.
- **UC17 Manage accounts** (Owner): list users with last sign-in, change a role, end
  sessions, delete an account. Extensions: removing or demoting the last owner → `409
  last_owner`.
- **UC18 Review sign-in activity** (Owner): last 200 `auth_events`, newest first.

## 4. Data rules

### 4.1 Storage

- `users`: `id` (UUID), `username`, `username_key` (lower-cased, unique), `password_hash`,
  `role` (`owner` | `viewer`), `created_at`.
- `sessions`: `id`, `user_id` (FK cascade), `token_hash` (unique), `created_at`,
  `last_seen_at`, `expires_at`, `revoked_at`, `user_agent` (truncated to 200).
- `auth_tokens`: `id`, `token_hash` (unique), `kind` (`setup` | `invite` | `reset`),
  `role` (nullable, invites), `user_id` (nullable, resets; FK cascade), `expires_at`,
  `used_at`.
- `auth_events`: `id` (autoincrement), `at`, `kind`, `user_id` (nullable, SET NULL),
  `ip`, `username_tried` (failures only).
- `profiles.user_id` (FK users, cascade): nullable until setup adopts the existing rows.
- Username: 3–32 chars, letters, digits, `.`, `_`, `-`, unique case-insensitively.

### 4.2 Auth API

| Route | Auth | Answer |
| --- | --- | --- |
| `GET /auth/status` | public | `{ setupRequired }` and, when signed in, `{ user }` |
| `POST /auth/setup` `{ token, username, password }` | public, once | `201 User` + cookie |
| `POST /auth/redeem` `{ token, username?, password }` | public | `200 User` + cookie |
| `POST /auth/session` `{ username, password }` | public | `200 User` + cookie |
| `DELETE /auth/session` · `DELETE /auth/sessions` | session | `204` |
| `PUT /auth/password` `{ current, next }` | session | `204`, other sessions revoked |
| `GET /users` · `PATCH /users/:id` `{ role }` · `DELETE /users/:id` | owner | list · `200` · `204` |
| `POST /users/:id/reset` | owner | `201 { link }` |
| `POST /invitations` `{ role }` | owner | `201 { link, expiresAt }` |
| `GET /users/:id/sessions` · `DELETE /users/:id/sessions` | owner | list · `204` |
| `GET /auth/events` | owner | `200 AuthEvent[]` |

Links are `PUBLIC_URL/#/redeem/<token>`; the token is in the fragment (never sent to a
server or a proxy log) and is posted in the body.

### 4.3 Public routes (allow-list)

`GET /health`, `GET /auth/status`, `POST /auth/setup`, `POST /auth/redeem`,
`POST /auth/session`, and the static web build. Everything else is `401
unauthenticated` without a valid session.

### 4.4 Roles on existing routes

- Owner only: `POST /libraries`, `POST /libraries/:id/scan`, `POST
  /libraries/:id/enrich`, and the user routes above.
- Viewer and owner: `GET /libraries…`, `GET /media…` (including file, subtitles),
  `GET /artwork/:file`, `/playback/sessions…`, and the profile and progress routes for
  their own profiles.
- `GET /profiles` returns only the caller's profiles; `POST /profiles` creates under the
  caller (limit 12 per user).

## 5. Remote-access recipe

- Caddy terminates HTTPS and proxies to Fastify (`reverse_proxy 127.0.0.1:3000`),
  automatic certificates, HSTS (`Strict-Transport-Security: max-age=31536000`).
- `HOST` stays `127.0.0.1` (or the Docker network address); the container port is never
  published to the internet.
- Environment: `PUBLIC_URL=https://…` (Secure cookie, Origin check, invite links),
  `TRUST_PROXY=1` so the rate limiter sees the client IP from `X-Forwarded-For`; never
  set it without a proxy (spoofable).
- Streaming routes keep working: the session cookie accompanies `<video>`, `<img>` and
  `<track>` requests because they are same-origin.

## 6. Error shape

Same as the other modules: `{ error: '<code>' }`. Codes: `unauthenticated` (401),
`forbidden` (403), `csrf` (403), `invalid_credentials` (401), `too_many_attempts` (429),
`token_invalid` (404), `username_taken` (409), `last_owner` (409), `not_found` (404).

## 7. Out of scope here (follow-up issues)

1. Email: address verification, email change, reset by email, SMTP configuration.
2. Optional TOTP second factor (with recovery codes).
3. Homelab deployment and Caddy files in the infrastructure repository.

Issues are filed when this spec is validated; #18 stays the umbrella until the core
ships.

## 8. Test plan

- Unit: hasher (hash/verify/dummy), token generation and hashing, rate limiter windows,
  username/password validation, CSRF predicate (table of `Origin` / `Sec-Fetch-Site`).
- Repository (in-memory SQLite): sessions (slide, idle, absolute, revoke), single-use
  tokens, last-owner invariant, profile adoption, cascades.
- Routes (`app.inject`): setup once, invite → redeem, sign-in/out, lockout, no
  enumeration (identical bodies and similar status), every existing route `401` without
  a cookie, `403` for a viewer on owner routes, cross-user profile → `404`, CSRF `403`.
- Web: sign-in screen, setup screen, redeem screen, users panel, `401` → sign-in.
- Security: gitleaks, a manual pass over SEC-01…SEC-10 (skill `qa-browser-check`).
