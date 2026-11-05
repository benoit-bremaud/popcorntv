# ADR-0010 — Accounts: owner invitations, server-side sessions, Origin-checked cookies

- Status: accepted (owner validated the weights, #18 chat, 2026-11-05)
- Date: 2026-11-05
- Deciders: owner
- Related: UC11–UC20 ([spec](../specs/auth.md)), ADR-0008 (profiles), issue #18

## Context

#18 puts accounts in front of every route so PopCornTV can leave the LAN. Email
(verification, reset by mail) and TOTP are split into follow-up issues (spec §7); this
ADR covers the core. Fixed by the issue, not re-decided here: argon2id hashing, HttpOnly
+ Secure + SameSite cookies, rate limiting with generic errors, an audit log, a reverse
proxy in front of Fastify. Scores 0–5, weights /100, totals /500; scores are estimates.

## 1. How a person gets an account

- **A — Invitation link**: the owner issues a single-use expiring link bound to a role;
  the guest picks their own username and password. The same mechanism serves password
  reset (kind `reset`).
- **B — Open sign-up with owner approval**: a public form, accounts wait for approval.
- **C — Owner creates the account** with a temporary password handed over out of band.

| Criterion                              | Weight | A                                        | B                                      | C                                  |
| -------------------------------------- | -----: | ---------------------------------------- | -------------------------------------- | ---------------------------------- |
| Security (no public sign-up surface)   |     35 | 5 — nothing to spam or probe             | 3 — public endpoint, spam, enumeration | 3 — password travels in chat       |
| Works without SMTP                     |     30 | 4 — owner pastes the link                | 3 — approval needs a notice            | 5                                  |
| Owner control                          |     20 | 5                                        | 4                                      | 5                                  |
| UX for the guest                       |     15 | 3 — one extra step                       | 4                                      | 2 — must change a password         |
| **Total / 500**                        |    100 | **440**                                  | 335                                    | 385                                |

Points: A = 175+120+100+45 · B = 105+90+80+60 · C = 105+150+100+30.
Sensitivity: no-SMTP at 40 (others renormalised) → A 434, C 401. **A.**

## 2. How a session is kept

- **A — Server-side session table**, opaque random token in the cookie, only its SHA-256
  stored.
- **B — Stateless JWT** in a cookie or header.
- **C — Signed cookie carrying the payload** (e.g. `@fastify/secure-session`).

| Criterion                              | Weight | A                                        | B                                      | C                                  |
| -------------------------------------- | -----: | ---------------------------------------- | -------------------------------------- | ---------------------------------- |
| Revocable at once (sign out, owner)    |     35 | 5 — delete the row                       | 1 — wait for expiry or keep a deny list | 1 — same                          |
| Resists theft / tampering              |     25 | 5 — opaque, hashed at rest               | 3 — payload readable, key rotation     | 4                                  |
| KISS                                   |     25 | 4 — one table, one hook                  | 3 — keys, refresh flow                 | 4                                  |
| Works for `<video>`, `<img>`, `<track>` |     15 | 5 — cookie sent automatically            | 4 — header breaks media tags           | 5                                  |
| **Total / 500**                        |    100 | **475**                                  | 245                                    | 310                                |

Points: A = 175+125+100+75 · B = 35+75+75+60 · C = 35+100+100+75.
Sensitivity: KISS at 40 (others renormalised) → A 460, C 328. **A.**

## 3. CSRF protection for unsafe methods

- **A — `SameSite=Lax` cookie plus an `Origin` / `Sec-Fetch-Site` check** on every
  request other than GET, HEAD or OPTIONS: `403` when `Sec-Fetch-Site` is `cross-site`, or when an `Origin`
  header is present and differs from `PUBLIC_URL`'s origin (spec R7).
- **B — Synchronizer token** per session, sent in a header.
- **C — Double-submit cookie.**

| Criterion                              | Weight | A                                        | B                                      | C                                  |
| -------------------------------------- | -----: | ---------------------------------------- | -------------------------------------- | ---------------------------------- |
| Protection                             |     40 | 4 — relies on browser headers            | 5                                      | 3 — cookie injection from subdomain |
| KISS                                   |     30 | 5 — one hook, no client change           | 2 — token plumbing everywhere          | 3                                  |
| Works with `keepalive` progress saves  |     15 | 5 — headers are automatic                | 2 — must be attached by hand           | 2                                  |
| No extra state                         |     15 | 5                                        | 2                                      | 5                                  |
| **Total / 500**                        |    100 | **460**                                  | 320                                    | 315                                |

Points: A = 160+150+75+75 · B = 200+60+30+30 · C = 120+90+30+75.
Sensitivity: protection at 55 (others renormalised) → A 445, B 365. **A**; `Lax`, not
`Strict`, so a link opened from another app keeps the session. GET routes have no
security-relevant side effect (only playback keep-alive and cache fills), so Lax adds
no hole.

## 4. How the first owner is created

- **A — One-time setup token** printed in the server log while no user exists;
  `POST /auth/setup` consumes it.
- **B — First visitor to register becomes owner.**
- **C — `OWNER_USERNAME` / `OWNER_PASSWORD` environment variables** read at start.

| Criterion                              | Weight | A                                        | B                                      | C                                  |
| -------------------------------------- | -----: | ---------------------------------------- | -------------------------------------- | ---------------------------------- |
| Safe on a fresh exposed install        |     40 | 5 — attacker needs log access            | 1 — first one in wins                  | 3 — password sits in compose / env |
| KISS                                   |     25 | 3                                        | 5                                      | 4                                  |
| Works headless in Docker               |     20 | 5 — `docker logs`                        | 5                                      | 5                                  |
| UX                                     |     15 | 3                                        | 5                                      | 3                                  |
| **Total / 500**                        |    100 | **420**                                  | 340                                    | 365                                |

Points: A = 200+75+100+45 · B = 40+125+100+75 · C = 120+100+100+45.
Sensitivity: safety at 55 (others renormalised) → A 440, C 349. **A.**

## 5. How profiles relate to users

- **A — A profile belongs to one user** (`profiles.user_id`); each user sees and manages
  only their own profiles; the migrated `default` profile is adopted by the first owner.
- **B — Profile = user**: drop the `profiles` table.
- **C — Profiles stay global**, shared by every user.

| Criterion                              | Weight | A                                        | B                                      | C                                  |
| -------------------------------------- | -----: | ---------------------------------------- | -------------------------------------- | ---------------------------------- |
| Household fit (kids on one account)    |     35 | 4 — several profiles per account         | 2 — one person, one history            | 5                                  |
| Privacy between accounts               |     30 | 5 — progress is private to the owner     | 5                                      | 1 — everyone reads everyone        |
| KISS / migration                       |     20 | 4 — one column, one adoption step        | 3 — reworks #10                        | 5                                  |
| Keeps the #10 UX                       |     15 | 4                                        | 2                                      | 5                                  |
| **Total / 500**                        |    100 | **430**                                  | 310                                    | 380                                |

Points: A = 140+150+80+60 · B = 70+150+60+30 · C = 175+30+100+75.
Sensitivity: privacy at 45 (others renormalised) → A 445, C 320. **A.** A profile of
another user answers `404 profile_not_found`, never `403`.

## Consequences

- Migration `0006` (drizzle-kit): tables `users`, `sessions`, `auth_tokens`, `auth_events`;
  `profiles.user_id` as a nullable column with an FK cascade (null only until setup;
  the repository never writes null) and the unique index moved to `(user_id,
  name_key)`. SQLite may need a table rebuild for that; check the generated SQL.
- Profile rules (name uniqueness, 12-profile limit, last profile) become per user, and
  playback sessions are bound to their user (spec R10).
- A new flat `src/auth/` module (spec §4.5); one `onRequest` hook reads each route's
  `config.access` (`public` | `owner` | absent = session), so every route, media and
  artwork included, is protected by default. The caller type lives in `src/http.ts`;
  `auth` depends on a narrow `Pick` of the profile repository, never the reverse.
- `PUBLIC_URL` becomes a required setting; the web build is served by Caddy, which
  strips `/api` (spec §5, deployment diagram); the compose file stops publishing the
  app port on every interface.
- Dependency: an argon2id binding (candidate `@node-rs/argon2`, prebuilt binaries; to be
  confirmed against current docs and the Docker image at implementation). No session or
  JWT library: the session code is ~100 lines over the repository.
- Profile management stops being open to the network (supersedes ADR-0008 §4).
- Without SMTP, "forgot my password" means asking the owner for a reset link; email
  delivery, verification and TOTP are separate issues (spec §7).
