# Sequence diagram — profiles — pick and manage a profile

> **Feature**: UC8 Pick a profile, UC9 Manage profiles —
> [use cases](../playback/01-use-case.md), [spec](../../specs/profiles.md)
> **Related ADRs**: ADR-0007, ADR-0008

## Context

How the web settles on the active profile, how the owner manages profiles, and how the
active profile scopes progress. The playback session flow is unchanged.

## Diagram

```mermaid
sequenceDiagram
  actor V as Viewer / Owner
  participant W as Web app
  participant S as localStorage
  participant API as Routes
  participant PR as Profile repository
  participant WR as Progress repository

  W->>S: read activeProfileId
  W->>API: GET /profiles
  API->>PR: list()
  API-->>W: 200 Profile[]
  alt remembered id in the list
    W-->>V: catalog for that profile
  else none, unknown or storage unavailable
    W-->>V: Who's watching?
    opt Manage profiles (UC9)
      V->>W: add / rename / delete
      W->>API: POST /profiles · PATCH · DELETE /profiles/:id
      API->>PR: create / update / remove (cascade progress)
      API-->>W: 201 · 200 · 204 | 409 last_profile / profile_name_taken / profile_limit
    end
    V->>W: pick a profile
    W->>S: write activeProfileId
  end
  W->>API: GET /profiles/:profileId/progress
  API->>WR: list(profileId)
  API-->>W: 200 WatchProgress[]
  loop while playing (ADR-0007 §3)
    W->>API: PUT /profiles/:profileId/media/:id/progress
    API->>WR: save(profileId, mediaId, position)
    API-->>W: 204 | 404 profile_not_found
  end
  V->>W: Switch profile
  W-->>V: Who's watching?
```

## Notes

- `profile_not_found` while saving means the profile was deleted from another device:
  the save is dropped like any failed save, and the next start shows the picker.
- Profiles are a preference boundary, not a security one, until #18 (ADR-0008 §4).
