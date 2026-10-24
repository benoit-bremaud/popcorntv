# State machine diagram — profiles — active profile in the web

> **Feature**: UC8 Pick a profile — [spec](../../specs/profiles.md)
> **Related ADRs**: ADR-0008

## Context

The web app's lifecycle around the active profile; the catalog only renders in
`Active`.

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Loading
  Loading --> Active: remembered id in GET /profiles
  Loading --> Picking: no / unknown id
  Loading --> Failed: server unreachable
  Failed --> Loading: retry
  Picking --> Active: pick (remember id)
  Picking --> Managing: Manage profiles
  Managing --> Picking: done
  Active --> Picking: Switch profile
```

## Notes

- A profile deleted from another device is caught at the next `Loading`: its id is no
  longer in `GET /profiles`. Until then its saves answer `404` and are dropped like any
  failed save (ADR-0007, spec 6a).
- `Managing` is the UC9 screen; deleting the last profile is refused, so `Picking`
  always lists at least one profile.
