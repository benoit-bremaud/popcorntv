# Class diagram — auth — accounts, sessions, tokens, events

> **Feature**: user accounts — [spec](../../specs/auth.md) §4.1 · **Related ADRs**:
> ADR-0010 (§5 profile ownership), ADR-0008

## Context

Persistent model added by #18 and its link to the profiles of #10. Cascades are database
foreign keys. The setup token is not persisted (spec UC11).

## Diagram

```mermaid
classDiagram
  class User {
    +id: string
    +username: string
    +usernameKey: string
    +passwordHash: string
    +role: Role
    +createdAt: string
  }
  class Role {
    <<enumeration>>
    owner
    viewer
  }
  class Session {
    +id: string
    +tokenHash: string
    +createdAt: string
    +lastSeenAt: string
    +expiresAt: string
    +revokedAt: string?
    +userAgent: string
  }
  class AuthToken {
    +id: string
    +tokenHash: string
    +kind: TokenKind
    +role: Role?
    +userId: string?
    +expiresAt: string
    +usedAt: string?
    +revokedAt: string?
  }
  class TokenKind {
    <<enumeration>>
    invite
    reset
  }
  class AuthEvent {
    +id: number
    +at: string
    +kind: AuthEventKind
    +ip: string
    +usernameTried: string?
  }
  class AuthEventKind {
    <<enumeration>>
    login_ok
    login_failed
    login_locked
    logout
    invite_issued
    invite_revoked
    reset_issued
    redeemed
    password_changed
    role_changed
    user_deleted
  }
  class Profile {
    +id: string
    +name: string
    +nameKey: string
    +avatar: string
  }

  User "1" *-- "0..*" Session : opens
  User "1" *-- "1..*" Profile : owns
  AuthToken "0..*" --> "0..1" User : resets
  AuthEvent "0..*" --> "0..1" User : concerns
  User --> Role
  AuthToken --> TokenKind
  AuthEvent --> AuthEventKind
```

## Notes

- `Profile.userId` is a nullable SQL column with an FK cascade; it is null only between
  migration `0006` and setup, and the repository never writes null. `(userId, nameKey)`
  is unique.
- `AuthEvent.userId` is `SET NULL` on delete, so history outlives an account.
- `tokenHash` holds SHA-256 of a 256-bit random token; the raw value is never stored or
  logged.
