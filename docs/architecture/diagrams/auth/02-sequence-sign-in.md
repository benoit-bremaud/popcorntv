# Sequence diagram — auth — sign in and use a session

> **Feature**: UC13 Sign in, UC14 Sign out — [use cases](01-use-case.md),
> [spec](../../specs/auth.md) · **Related ADRs**: ADR-0010

## Context

How a username and password become a session cookie, how every later request is
checked, and where rate limiting and the audit log sit. Failure answers are identical
for an unknown user and a wrong password (no enumeration).

## Diagram

```mermaid
sequenceDiagram
  actor U as Viewer / Owner
  participant W as Web app
  participant API as Auth routes
  participant RL as Rate limiter
  participant UR as User repository
  participant SR as Session repository
  participant AL as Audit log
  participant R as Any other route

  U->>W: username + password
  W->>API: POST /auth/session
  API->>API: Origin / Sec-Fetch-Site check (ADR-0010 §3)
  API->>RL: allow(ip, username)?
  alt locked out
    API->>AL: record login_locked
    API-->>W: 429 too_many_attempts (Retry-After)
  else allowed
    API->>UR: findByUsername()
    API->>API: verify argon2id (dummy hash if unknown)
    alt wrong credentials
      API->>RL: recordFailure(ip, username)
      API->>AL: record login_failed
      API-->>W: 401 invalid_credentials
    else ok
      API->>SR: create(userId) — token stored as SHA-256
      API->>AL: record login_ok
      API-->>W: 200 User + Set-Cookie session (HttpOnly, SameSite=Lax)
    end
  end

  loop every later request
    W->>R: request + cookie
    R->>SR: findValid(hash(token)) — idle and absolute expiry, slide
    alt no valid session
      R-->>W: 401 unauthenticated
      W-->>U: sign-in screen
    else role too low for the route
      R-->>W: 403 forbidden
    else ok
      R-->>W: the route's answer
    end
  end

  U->>W: Sign out
  W->>API: DELETE /auth/session (or /auth/sessions for all devices)
  API->>SR: revoke
  API-->>W: 204 + cookie cleared
```

## Notes

- The rate limiter counts failures per (IP, username) and per IP; a success clears the
  pair. The client IP comes from the socket, or from the proxy only when `TRUST_PROXY`
  is set (spec §5).
- Static assets of the web app and `GET /health` stay public; nothing under `/api` does,
  except the routes in spec §4.3.
