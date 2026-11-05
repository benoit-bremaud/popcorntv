# Sequence diagram — auth — sign in and use a session

> **Feature**: UC13 Sign in, UC14 Sign out — [use cases](01-use-case.md),
> [spec](../../specs/auth.md) · **Related ADRs**: ADR-0010

## Context

How a username and password become a session cookie, how the single `onRequest` hook
checks every later request, and where rate limiting and the audit log sit. Failure
answers are identical for an unknown user and a wrong password (no enumeration).

## Diagram

```mermaid
sequenceDiagram
  actor U as Viewer / Owner
  participant W as Web app
  participant H as Auth hook (onRequest)
  participant API as Auth routes
  participant RL as Rate limiter
  participant UR as User repository
  participant SR as Session repository
  participant EL as Event repository
  participant R as Any other route

  U->>W: username + password
  W->>H: POST /auth/session
  H->>H: CSRF check (R7) · route access = public
  H->>API: forward
  API->>RL: allow(ip, usernameKey)?
  alt locked out
    API->>EL: record login_locked (once per window)
    API-->>W: 429 too_many_attempts (Retry-After)
  else allowed
    API->>UR: findByUsername()
    API->>API: verify argon2id (dummy hash if unknown)
    alt wrong credentials
      API->>RL: recordFailure(ip, usernameKey)
      API->>EL: record login_failed
      API-->>W: 401 invalid_credentials
    else ok
      API->>SR: create(userId) — token stored as SHA-256
      API->>EL: record login_ok · purge stale rows
      API-->>W: 200 User + Set-Cookie (HttpOnly, SameSite=Lax)
    end
  end

  loop every later request
    W->>H: request + cookie
    H->>H: CSRF check on non-GET (R7)
    H->>SR: findValid(hash(token)) joined with the user's current role
    alt no valid session
      H-->>W: 401 unauthenticated
      W-->>U: sign-in screen
    else route access = owner and role = viewer
      H-->>W: 403 forbidden
    else ok
      H->>R: request.caller = { userId, role }
      R-->>W: the route's answer
    end
  end

  U->>W: Sign out
  W->>H: DELETE /auth/session (or /auth/sessions for all devices)
  H->>API: forward with caller
  API->>SR: revoke
  API-->>W: 204 + cookie cleared
```

## Notes

- Route paths are Fastify's; the browser calls them under `/api`, which Caddy strips
  (spec §5).
- `findValid` slides `last_seen_at` at most once per hour.
- The client IP comes from the socket, or from the proxy only when `TRUST_PROXY` is set.
