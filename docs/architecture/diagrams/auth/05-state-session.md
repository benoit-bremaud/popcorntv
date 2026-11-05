# State machine diagram — auth — session lifecycle

> **Feature**: UC13 Sign in, UC14 Sign out — [spec](../../specs/auth.md)
> **Related ADRs**: ADR-0010

## Context

A server-side session row, from creation to removal. The cookie only carries the opaque
token; every transition is decided server-side.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Active: sign in · setup · redeem
  Active --> Active: request within the idle window (last_seen_at, at most hourly)
  Active --> Expired: idle 14 days or absolute 90 days
  Active --> Revoked: sign out · owner ends it · password change or reset
  Active --> Revoked: replaced at sign-in, setup or redeem · evicted by the 20-session cap
  Active --> [*]: account deleted (cascade)
  Expired --> [*]: purged at start and on each sign-in
  Revoked --> [*]: purged at start and on each sign-in
```

## Notes

- `Expired` and `Revoked` sessions are never accepted, even before the purge runs.
- A password change (UC19) revokes every other session of that user; a reset (UC20)
  revokes all of them and opens a new one.
