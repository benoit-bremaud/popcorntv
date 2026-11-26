# On-demand progressive retrieval — behaviour contract

Behaviour contract of epic [#306](https://github.com/benoit-bremaud/popcorntv/issues/306) as
redefined on 2026-11-23 ([#434](https://github.com/benoit-bremaud/popcorntv/issues/434)): what the
server does from the sheet opening to the deletion of a retrieved file.

- Status: accepted conception (owner validation pending in the #434 PR), not implemented.
- Requirements: [08-on-demand-retrieval.md](../../requirements/08-on-demand-retrieval.md).
- Decisions: [ADR-0043](../decisions/0043-start-playback-from-a-sheet-prefetch.md),
  [ADR-0044](../decisions/0044-size-the-start-buffer-and-cap-the-cache.md),
  [ADR-0045](../decisions/0045-delete-after-48-hours-and-keep-a-favourite-third.md),
  [ADR-0046](../decisions/0046-pick-the-fastest-conforming-source.md),
  [ADR-0047](../decisions/0047-notify-through-bell-push-and-e-mail.md);
  [ADR-0034](../decisions/0034-verify-pieces-before-progressive-playback.md) keeps its
  verified-read contract.
- Diagrams: [use cases](../diagrams/on-demand-retrieval/01-use-case.md),
  [prefetch and playback](../diagrams/on-demand-retrieval/02-sequence-prefetch-and-play.md),
  [components](../diagrams/on-demand-retrieval/03-component.md),
  [file lifecycle](../diagrams/on-demand-retrieval/05-state-retrieved-file.md),
  [data flow](../diagrams/on-demand-retrieval/06-data-flow.md),
  [disk pressure](../diagrams/on-demand-retrieval/07-activity-disk-pressure.md),
  [deletion](../diagrams/on-demand-retrieval/07-activity-deletion.md).

## 1. Scope of slice 1 (films)

In: sheet prefetch, filling Play button, progressive playback, stop on close, seek priority,
failure pause and auto-resume, 48 h deletion, cache ceiling and eviction, automatic version pick
and the degraded choice. Out: series (REQ-64), « À venir » search cadence and notifications
(slice 3), favourites (slice 3), Statistics tab (slice 4), the new UI (after redesign #401: slice 1
ships on the current `DetailDialog` / `TitleSheet` with minimal changes).

## 2. Retrieved title

One **retrieved title** per film identity (`kind`, `tmdbId`) and selected version, shared by every
profile (REQ-10). It owns one cache generation (ADR-0034 item 5) and records:

- the selected version and its conformity verdict (conforming / degraded + reasons);
- the verified contiguous span from the start and the verified ranges beyond it;
- `lastSheetOpenAt`, `lastPlaybackAt`, the number of active playback leases;
- the favourite mark count (slice 3) and the trim target (first third, in bytes).

Its states are in the [lifecycle diagram](../diagrams/on-demand-retrieval/05-state-retrieved-file.md):
`prefetching`, `startReady`, `playing`, `paused`, `idle`, `favouriteThird`, `deleted`.
"Ready" is no longer a background state notified to profiles: the Play button shows the start
buffer directly.

## 3. Start buffer (ADR-0044)

Inputs: media duration `D` (s), average bitrate `R` (bit/s) from the version's size and duration,
measured sustained speed `S` (bit/s, sliding window), margin `m` (default 1.25), start position `t0`.

```text
need(s)  = 30                                   if S ≥ m·R
         = 30 + (D − t0) · (1 − S / (m·R))      otherwise
cap(B)   = min(1 GiB, 10 % of the file size)
target   = min(need · R / 8, cap)               (bytes)
full     = verified contiguous bytes from t0 ≥ target
warning  = need · R / 8 > cap                    → sheet shows "playback may pause"
```

- `S` unknown (first seconds): target = 30 s of media, recomputed at each telemetry update.
- The function is pure (no IO), lives with the other playback rules in `packages/shared`, and is
  tested with deterministic traces (fast, slow, equal, oscillating, unknown, VBR) (NFR-17).
- `m`, 1 GiB and 10 % are estimates to measure on staging by the owner (NFR-16); they are settings,
  not constants buried in code.

## 4. Prefetch and playback rules

- **Prefetch** (REQ-46): opening the sheet asks for the start buffer at prefetch priority. A second
  opening refreshes `lastSheetOpenAt` and never restarts the retrieval. Unplayed after 6 h →
  purged (lifecycle `prefetching|startReady → deleted`).
- **Early click** (REQ-49): Play before `full` raises the title to playback priority; the sheet
  stays until the first frame. Target ≤ 30 s at ≥ 20 Mb/s (NFR-16).
- **Playback** (REQ-50): a playback lease pins the generation; the rest of the file is retrieved at
  playback priority; frames come only from verified bytes through the existing HLS path
  (`transcoder`) or direct play when the file is complete. Closing the player releases the lease
  and stops the retrieval; bytes stay.
- **Seek** into a missing range: the retrieval reorders its pieces around the target; the player
  waits with a bounded deadline (REQ-18, REQ-19 kept).
- **Failure** (REQ-56, option B): the buffer keeps playing; at its end the player pauses with
  "source unavailable", retries with backoff, resumes by itself and offers Retry. The VPN kill
  switch ([ADR-0035](../decisions/0035-share-retrieval-vpn-namespace.md),
  [VPN retrieval spec](nordvpn-retrieval.md), #328) forbids any egress outside the VPN; a missing
  VPN is a failure, never a fallback.

## 5. Priorities and quotas (REQ-57)

One scheduler orders the work: playback > early click > favourite third > prefetch > « À venir »
search. Bandwidth is shared under the owner cap (default 70 %); about 3 retrievals run at once;
active preparations are limited per account (3 household, 2 guest, owner-adjustable). A request
over quota is queued and the sheet says so; it is never dropped silently.

## 6. Cache ceiling and deletion (ADR-0044, ADR-0045)

- Ceiling = min(owner value, cache usage + free space of the cache volume − 15 % of the volume),
  owner value 100 GiB by default; recomputed before every reservation. The cache usage is added
  because its bytes already lower the reported free space: 15 % of the volume always stays free.
- Eviction under pressure: [activity](../diagrams/on-demand-retrieval/07-activity-disk-pressure.md).
  A playback with nothing left to evict keeps a sliding window: it releases its own played pieces
  behind a 30 s back buffer, never a favourite third; if that frees nothing, it pauses with a
  message. The ceiling is never exceeded.
- Deletion and favourite trim: [activity](../diagrams/on-demand-retrieval/07-activity-deletion.md),
  run by the serial timer every 15 min and at start-up (restart never skips an overdue deletion).
- Files under `MEDIA_ROOT` are out of reach: the cache lives under its own root (`RETRIEVAL_DIR`,
  planned), confined like the other paths, on the dedicated filesystem of #328 whose controller
  refuses a mount that shares a tree with `MEDIA_ROOT` or an undeclared library.

## 7. Version pick (ADR-0046)

1. Keep only sources whose files are all video or subtitle files and pass ffprobe with
   `localInputArgs` (REQ-55); reject the others whole.
2. Conformity per version: resolution ≥ profile quality (720p default), original audio, French
   audio, French subtitles (embedded or external file). Missing items are listed as reasons.
3. Pick the fastest conforming version (measured speed, then peers). None conforming → offer the
   degraded versions, fastest first, with their reasons; play one only on explicit choice.
4. "Other versions" lists every acceptable version with its verdict.

## 8. Security and privacy

- Sources see a title identity only, never a profile, a wish or a history (NFR-18).
- Every read goes through the confined generation descriptor and verified pieces (ADR-0034).
- Every file is probed with `localInputArgs` before admission (ADR-0028); nothing is executed.
- Logs follow ADR-0021: event names, ids and reasons, no source URL, no file name from a source.

## 9. Measurements left to the owner

`m`, the 1 GiB / 10 % cap, the 100 GiB default and the 15 % reserve are estimates. The owner
measures them on staging with real titles (NFR-16, NFR-17); the agent never triggers a real
retrieval. Any change goes through ADR-0044.

## 10. Reuse of the unmerged #306 branches

The branches of #310–#315 are not merged and are not touched by this conception. Each
re-planned issue states what it may reuse after review: the verified-read cache of #311
(`23b66eb`), the source search of #310. The VPN namespace of #328 is ported first
(empty installation and controller; migration and saved-transfer tooling dropped). The daily preparation of every
wish (#310, #314 A) is dropped.

## Code map

Existing files and symbols the flow touches or extends, and planned ones. Paths are relative to
this file.

| Area | File and symbol | Change |
|---|---|---|
| Sheet (library) | [`DetailDialog`](../../../apps/web/src/catalog/DetailDialog.tsx) | starts the prefetch on open, renders the filling Play button, "Other versions" menu |
| Sheet (Discover) | [`TitleSheet`](../../../apps/web/src/discover/TitleSheet.tsx) | same for titles not in the library |
| Player | [`PlayerDialog`](../../../apps/web/src/playback/PlayerDialog.tsx) | failure pause, Retry, closing releases the lease |
| Bell | [`NotificationBell`](../../../apps/web/src/discover/NotificationBell.tsx), `notificationText` | "source found" and "degraded only" reasons (slice 3) |
| Playback decision | [`decidePlayback`](../../../packages/shared/src/playback.ts), `audioTracks`, `effectiveAudioIndex` | input becomes a retrieved generation as well as a library file |
| Start buffer rule | `startBufferTarget` in `packages/shared/src/retrieval.ts` | planned, pure |
| Version conformity | `versionVerdict` in `packages/shared/src/retrieval.ts` | planned, pure |
| Playback sessions | [`registerSessionRoutes`](../../../apps/server/src/playback/session-routes.ts), [`SessionManager`](../../../apps/server/src/playback/session-manager.ts) | accept a retrieved generation, hold the playback lease |
| Transcode | [`createTranscoder`](../../../apps/server/src/playback/transcoder.ts), [`ffmpegArgs`](../../../apps/server/src/playback/ffmpeg-args.ts) | read from the verified-piece pipe (ADR-0034 item 4) |
| Complete-file serving | [`confinedPath`](../../../apps/server/src/playback/routes.ts), `registerPlaybackRoutes` | confine `RETRIEVAL_DIR` beside `MEDIA_ROOT` |
| Probe | [`createFfprobe`](../../../apps/server/src/library/ffprobe.ts), [`localInputArgs`](../../../apps/server/src/ffmpeg-input.ts) | probe every source file before admission |
| Wishlist | [`WishlistRepository`](../../../apps/server/src/discover/wishlist-repository.ts) | becomes « À venir » (slice 3) |
| Preparation requests | [`PreparationRequestRepository`](../../../apps/server/src/discover/preparation-request-repository.ts) | reused for shared, deduplicated retrieval requests |
| Notifications | [`NotificationRepository`](../../../apps/server/src/discover/notification-repository.ts), [`registerNotificationRoutes`](../../../apps/server/src/discover/notification-routes.ts) | new reasons; channels (slice 3) |
| Notice timer | [`availabilityEvents`](../../../apps/server/src/discover/availability-check.ts), `startAvailabilityCheck` | « À venir » search cadence (slice 3) |
| Timers | [`startSerialTimer`](../../../apps/server/src/timer.ts) | deletion and purge sweep |
| Retrieval scheduler | `apps/server/src/retrieval/scheduler.ts` | planned: priorities, quotas, bandwidth cap |
| Retrieval cache | `apps/server/src/retrieval/cache.ts` | planned: generations, verified ranges, ceiling, eviction (reuses #311 after review) |
| Retrieval source | `apps/server/src/retrieval/source.ts` | planned: search and fetch through the VPN (reuses #310, #328 after review) |
| Deletion sweep | `apps/server/src/retrieval/sweep.ts` | planned: 6 h purge, 48 h deletion, favourite trim |
| Push and e-mail | `apps/server/src/notifications/channels.ts` | planned, slice 3 (ADR-0047) |
