# State machine diagram — on-demand retrieval — retrieved file

> **Feature**: UC40, UC42 — file lifecycle
> **Requirements**: REQ-46, REQ-47, REQ-50–53, REQ-56
> **Related ADRs**: ADR-0034, ADR-0043, ADR-0044, ADR-0045

One machine per retrieved title (shared by profiles). Files under `MEDIA_ROOT` have no such
machine. Times: `t_sheet` = last sheet opening, `t_play` = last playback end.

## Diagram

```mermaid
---
title: stm — Retrieved file
---
stateDiagram-v2
  [*] --> Prefetching: sheet opened [space and quota] / reserve start buffer
  [*] --> FavouriteThird: favourite added [space] / retrieve first third
  state "prefetching" as Prefetching
  state "startReady" as StartReady
  state "playing" as Playing
  state "paused" as Paused
  state "idle" as Idle
  state "favouriteThird" as FavouriteThird
  state "deleted" as Deleted

  Prefetching --> StartReady: piece verified [start buffer full]
  Prefetching --> Playing: play [lease granted] / raise priority
  Prefetching --> Deleted: sweep [now − t_sheet ≥ 6 h] / purge
  Prefetching --> Deleted: eviction [unplayed, oldest] / purge
  StartReady --> Playing: play [lease granted]
  StartReady --> Deleted: sweep [now − t_sheet ≥ 6 h] / purge
  StartReady --> Deleted: eviction [unplayed, oldest] / purge
  Playing --> Paused: source or VPN lost [buffer empty] / show pause
  Paused --> Playing: source back / resume
  Paused --> Playing: Retry [source back]
  Playing --> Idle: last lease released / stop retrieval, t_play = now
  Paused --> Idle: last lease released / stop retrieval, t_play = now
  Idle --> Playing: play [lease granted] / resume retrieval
  Idle --> Deleted: sweep [not favourite and now − t_play ≥ 48 h] / delete file
  Idle --> Deleted: eviction [not favourite, oldest t_play] / delete file
  Idle --> FavouriteThird: sweep [favourite and now − t_play ≥ 48 h] / trim to first third
  FavouriteThird --> Playing: play [lease granted] / retrieve the rest
  FavouriteThird --> Idle: last favourite removed [played before] / t_play unchanged
  FavouriteThird --> Deleted: last favourite removed [never played] / delete file
  Deleted --> [*]
```

## Rules

- `playing` holds at least one lease: never evicted, never deleted (REQ-51, REQ-53).
- `favouriteThird` is never evicted; it leaves only by a playback or the last favourite removal.
- `idle` keeps retrieving nothing; the 48 h clock starts at the last lease release.
- Internal transitions (no state change): a sheet opening in any state refreshes `t_sheet`; a new
  lease in `playing` increments the lease count.
- An event not listed for a state is rejected without effect; the sweep also runs at start-up so a
  restart never skips an overdue deletion.
- Removing the last favourite from `favouriteThird` goes to `idle` with the old `t_play`: the 48 h
  rule then deletes it at the next sweep if the delay has passed. A third that was never played
  has no `t_play`: it is deleted at once.
