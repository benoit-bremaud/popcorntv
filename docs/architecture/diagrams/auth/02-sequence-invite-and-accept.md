# Sequence diagram — auth — first owner, invitation and reset

> **Feature**: UC11 Set up the first owner, UC12 Accept an invitation, UC15 Invite a
> person, UC16 Reset a password — [use cases](01-use-case.md),
> [spec](../../specs/auth.md) · **Related ADRs**: ADR-0010

## Context

The three flows that create or recover credentials without email. All use a single-use,
expiring token; only its SHA-256 is stored.

## Diagram

```mermaid
sequenceDiagram
  actor O as Owner
  actor G as Invited person
  participant W as Web app
  participant API as Auth routes
  participant TR as Token repository
  participant UR as User repository
  participant PR as Profile repository
  participant SV as Server log

  Note over SV,API: First start, no user exists
  API->>TR: create(kind=setup, ttl 1 h)
  API->>SV: print setup token once
  O->>W: setup token + username + password
  W->>API: POST /auth/setup
  API->>TR: consume(setup)
  API->>UR: create(role=owner)
  API->>PR: adopt profiles without owner (migrated "default")
  API-->>W: 201 + session cookie

  Note over O,G: Invite or reset
  O->>W: Invite a person (role) / Reset password for X
  W->>API: POST /invitations {role} · POST /users/:id/reset
  API->>TR: create(kind=invite|reset, ttl 72 h)
  API-->>W: 201 one-time link (shown once)
  O-->>G: sends the link (any channel)
  G->>W: opens link, picks username + password (or new password)
  W->>API: POST /auth/redeem {token, username, password}
  alt token unknown, used or expired
    API-->>W: 404 token_invalid
  else ok
    API->>TR: consume (single use)
    API->>UR: create viewer/owner · or set password + revoke all sessions
    API->>PR: create a first profile for a new user
    API-->>W: 200 + session cookie
  end
```

## Notes

- `POST /auth/setup` answers `404` once any user exists, so an exposed fresh install
  cannot be taken over without the log's token (ADR-0010 §4).
- An expired setup token is replaced by a new one at the next server start.
- The link is built from `PUBLIC_URL`; the token travels in the URL fragment so it never
  reaches proxy logs or `Referer`.
