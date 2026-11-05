# Component diagram — auth — authentication in front of every route

> **Feature**: user accounts and secure remote access — [spec](../../specs/auth.md)
> §4.5 · **Related ADRs**: ADR-0010 · Extends the
> [playback components](../playback/03-component.md); nodes and network are in the
> [deployment diagram](08-deployment-prod.md)

## Context

Which server modules authentication adds and how they depend on the existing ones. The
dependency direction keeps `auth` a leaf user of `profiles`, never the reverse.

## Diagram

```mermaid
flowchart LR
  subgraph Server["apps/server"]
    Http["src/http.ts: Caller type, request augmentation"]
    subgraph Auth["src/auth/"]
      Hook["hook (onRequest): CSRF, session, route access"]
      Routes["routes: status, setup, redeem, session, password"]
      UserRoutes["user-routes: users, invitations, events"]
      Limiter["limiter"]
      Hasher["hasher (only argon2 import)"]
      Repos["user-, session-, token-, event-repository"]
    end
    Profiles["src/profiles/ (repository, routes)"]
    Others["library, metadata, playback, progress routes"]
  end
  DB[("SQLite")]

  Hook --> Repos
  Hook --> Http
  Routes --> Limiter
  Routes --> Hasher
  Routes --> Repos
  UserRoutes --> Repos
  Routes -->|"Pick: adoptOrphans, createFirst"| Profiles
  Profiles --> Http
  Others --> Http
  Repos --> DB
  Profiles --> DB
```

## Notes

- One `onRequest` hook reads `request.routeOptions.config.access` (`public` | `owner` |
  absent = session); a new route is protected by default.
- `profiles`, `progress` and `playback` read `request.caller` through `src/http.ts` and
  never import `src/auth/`.
- The hasher is the only argon2 consumer, following the "single egress" modules
  (`ffprobe`, `tmdb-client`, `transcoder`); no interface while there is one
  implementation.
