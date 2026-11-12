# Preparation lifecycle

One machine per shared movie/episode preparation. Draft enum and transition contract, not current runtime behavior. Public states remain independent of active playback leases. Invalid/unrecognized events are rejected without side effects; telemetry from a stale generation is ignored.

```mermaid
---
title: stm — Preparation
---
stateDiagram-v2
  [*] --> Pending
  state "pending" as Pending
  state "searching" as Searching
  state "preparing" as Preparing
  state "ready" as Ready
  state "failed" as Failed
  state "cancelled" as Cancelled
  Pending --> Searching: due [authorized and capacity available] / persist attempt
  Pending --> Cancelled: cancel [no interests and no lease]
  Searching --> Pending: source absent / persist next daily due
  Searching --> Preparing: source accepted [constraints satisfied] / bind generation
  Searching --> Failed: attempt failed / persist classified failure
  Searching --> Cancelled: cancel [no interests and no lease]
  Preparing --> Ready: observation [readiness valid] / persist ready and unique notices
  Preparing --> Failed: recovery failed / persist classified failure
  Preparing --> Cancelled: cancel [no interests and no lease]
  Ready --> Preparing: evidence changed [no longer ready] / invalidate new starts
  Ready --> Failed: content invalid / invalidate new starts
  Ready --> Cancelled: cancel [no interests and no lease]
  Failed --> Pending: retry due [transient and authorized] / reconcile attempt
  Failed --> Pending: owner retry [cause resolved] / reconcile attempt
  Failed --> Cancelled: cancel [no interests and no lease]
  Cancelled --> Pending: follow again [authorized] / create new attempt
```

Internal behaviors (no state re-entry):
- Any state: `removeInterest` detaches only that subscriber. A denied `cancel` (interest or lease exists) is rejected without a transition. Cancellation stops orchestration; it does not authorize file deletion.
- An authenticated own-profile wishlist addition creates a pending intent automatically. Failed authentication/ownership creates no preparation. No per-title owner approval state exists. Missing backend configuration leaves pending with a reason and no external call.
- Pending: early tick or admission refusal stays pending without external search.
- Searching: uncertain submission stays reconciling within the bounded attempt, then a classified failure/backoff if unresolved. Duplicate callbacks are idempotent.
- Preparing: observations that do not establish readiness update the snapshot. Low sustained speed latches full-file-only for this attempt. Disk/capacity pause remains preparing with a reason.
- Ready: healthy observations preserve readiness and do not create more notifications. A new follower may receive their one initial notice. Play pins a separate lease without changing preparation state.
- Restart: revoke unverified readiness, reconcile generation/backend/cache and re-evaluate. Interrupted searching becomes a reconciliation attempt before any resubmission. A completed valid file may restore ready without a second notice.

Cancelled is not final: following again may create a new attempt. Failed is retryable only under the guards above. Source replacement first invalidates ready and then binds a new generation in preparing. Exact event/transition cases are listed in the traceability matrix.
