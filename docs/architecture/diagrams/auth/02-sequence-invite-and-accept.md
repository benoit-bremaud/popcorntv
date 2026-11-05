# Sequence diagram — auth — first owner, invitation and reset

> **Feature**: UC11 Set up the first owner, UC12 Accept an invitation, UC15 Invite a
> person, UC16 Reset a password, UC20 Set a new password — [use cases](01-use-case.md),
> [spec](../../specs/auth.md) · **Related ADRs**: ADR-0010

## Context

The flows that create or recover credentials without email. Every token is single-use
and expiring; only its SHA-256 is kept (in memory for setup, in `auth_tokens` for the
others). Each redeem runs in one database transaction.

## Diagram

```mermaid
sequenceDiagram
  actor O as Owner
  actor G as Invited person / account holder
  participant W as Web app
  participant API as Auth routes
  participant TR as Token repository
  participant UR as User repository
  participant PR as Profiles (narrow port)
  participant SV as Server log

  Note over API,SV: Start with no user
  API->>API: keep hash(setup token) + expiry 1 h in memory
  API->>SV: print setup token once
  O->>W: setup token + username + password
  W->>API: POST /auth/setup
  rect rgb(240, 240, 240)
    Note right of API: one transaction
    API->>UR: no user exists? create(role=owner)
    API->>PR: adoptOrphans(userId)
    API->>API: create session · set last_login_at
  end
  API-->>W: 201 + session cookie

  Note over O,G: Invite (72 h) or reset (24 h)
  O->>W: Invite a person (role) / Reset password for X
  W->>API: POST /invitations {role} · POST /users/:id/reset
  API->>TR: create(kind, ttl) — a new reset revokes the previous one
  API-->>W: 201 one-time link (shown once)
  O-->>G: sends the link (any channel)
  G->>W: opens #/invite/<token> or #/reset/<token>
  W->>API: POST /auth/redeem {kind, token, username?, password}
  rect rgb(240, 240, 240)
    Note right of API: one transaction
    API->>TR: consume — UPDATE … WHERE unused, unrevoked, unexpired, kind matches
    alt no row changed
      API-->>W: 404 token_invalid
    else invite
      API->>UR: create(role) — 409 username_taken rolls back, token stays usable
      API->>PR: createFirst(userId, username)
      API->>API: revoke the carried session · create session · set last_login_at
      API-->>W: 200 + session cookie
    else reset
      API->>UR: revoke the carried session · set password · revoke all sessions · create session · set last_login_at
      API-->>W: 200 + new session cookie
    end
  end
```

## Notes

- `POST /auth/setup` answers `404` once any user exists; an exposed fresh install
  cannot be taken over without the log's token (ADR-0010 §4).
- The link is built from `PUBLIC_URL`; the token travels in the URL fragment, so it
  never reaches a proxy log or `Referer`.
