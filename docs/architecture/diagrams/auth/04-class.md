# Class diagram — auth — accounts, sessions, tokens, audit

> **Feature**: user accounts — [spec](../../specs/auth.md) §4.1 · **Related ADRs**:
> ADR-0010 (§5 profile ownership), ADR-0008

## Context

Persistent model added by #18 and its link to the profiles of #10. Cascades are database
foreign keys.

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
    +expiresAt: string
    +usedAt: string?
  }
  class TokenKind {
    <<enumeration>>
    setup
    invite
    reset
  }
  class AuditEvent {
    +id: number
    +at: string
    +kind: AuditKind
    +ip: string
    +usernameTried: string?
  }
  class Profile {
    +id: string
    +name: string
    +avatar: string
  }

  User "1" *-- "0..*" Session : opens
  User "1" *-- "1..*" Profile : owns
  User "1" o-- "0..*" AuthToken : issues or redeems
  User "0..1" <-- "0..*" AuditEvent : concerns
  User --> Role
  AuthToken --> TokenKind
```

## Notes

- `Profile.userId` is a new NOT NULL foreign key (cascade); the migration leaves it
  nullable until `POST /auth/setup` adopts the existing profiles (ADR-0010 §5).
- `AuditEvent.userId` is nullable and `SET NULL` on delete, so history outlives an
  account. `usernameTried` is stored only for failures.
- `tokenHash` columns hold SHA-256 of a 256-bit random token; the raw value is never
  stored or logged.
