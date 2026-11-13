# Adaptive wishlist — durable preparation requests

This accepted implementation contract for #309 turns an owned wishlist entry into durable shared demand without a network write inside the HTTP transaction.

## Status and delivery

Accepted by the owner in conversation before runtime implementation. The owner accepted the revised
delivery order in #306: #309, #310, #311, complete-file #314, first real-test #315, then
#312/#313, progressive #314, #316 and final #315. Child restrictions no longer block #309.
No real acquisition, deployment or claim of child suitability follows from this document.

Current main contains wishlist storage and profile ownership checks, but no Seerr adapter.
The earlier #128 adapter exists in commit `283a1e5` on another branch. Its in-memory deduplication
and POST-only interface do not provide restart-safe reconciliation. Reuse its reviewed fixed
destination and sanitized response handling when integrating it; do not silently cherry-pick
the whole unvalidated branch or claim it is already deployed.

## Acceptance contract

1. An authenticated user adding a title to their own profile atomically persists the wish and
   its preparation interest. A transaction failure leaves neither half committed. Anonymous,
   expired-session and cross-account profile writes remain denied by existing server auth.
2. Repeated/concurrent additions share one title demand across profiles, with one private
   interest per profile. Movie and TV identifiers cannot collide. Refreshing a wish preserves
   the original interest identity and creation time.
3. Series interest is a monitoring demand, not a playable episode. Explicit episode preparations
   use series TMDB ID plus nonnegative season and positive episode numbers; season zero is
   valid. Movie, series and episode namespaces remain distinct. No season-wide ready signal.
4. Removing a wish detaches only that profile's interests. Shared preparation, upstream jobs,
   playback pins and other subscribers survive. Removing and re-adding creates a new private
   subscription identity, so old notifications cannot become the new subscription's notices.
5. Existing wishlist rows receive persistent interests in the migration, without submitting
   external requests. Existing local title matches require playback validation before any
   acquisition; a series container alone cannot establish all episodes are present.
6. A preparation identity is opaque and independent of download clients. Optional upstream
   linkage uses a fixed adapter namespace and upstream job reference, never a browser-provided
   URL. A changed publication/generation is not a new wishlist identity or permission grant.
7. Before any external submission, commit a unique attempt token and an uncertain-write state.
   Never hold a SQLite transaction over network IO. Confirm acceptance only against that token.
   A crash/timeout stays uncertain; stale responses cannot overwrite a newer attempt.
8. An uncertain attempt cannot be retried until reconciliation proves acceptance or definitive
   nonacceptance. This requires fencing the original dispatcher so it cannot still issue a
   POST, and a provider guarantee that an earlier in-flight write cannot later be accepted.
   One empty lookup, a timeout or expiry of a local lease is insufficient. A verified provider
   idempotency key can replace this proof only if its semantics are actually supported.
   Missing/unavailable/inconclusive upstream information keeps the attempt blocked.
   If the chosen service cannot establish nonacceptance safely, require operator reconciliation
   with the same proof requirements; an operator retry button does not waive them;
   do not promise exactly-once remote writes without provider support.
9. Requests with no remaining interest are not eligible for a new submission. Recheck demand
   in the same transaction that claims an attempt. Removing the last wish after claim cannot
   undo a request already sent; reconciliation still completes and no profile is reattached.
10. No new public upstream-submit endpoint, auto-approval administrator override, client registry,
    scheduler, deletion policy or readiness calculation belongs in #309. The future #310 worker
    consumes persisted intents and implements provider reconciliation; no external writes run
    in #309. This is a deliberate split of persistence from the daily-search service integration.

## Persistence and boundaries

`preparation_demands` stores an opaque ID, title kind/TMDB key, creation time and durable scheduling
handoff. `preparation_interests` has its own opaque ID and profile/title linkage, uniquely constrained
per wishlist row and deleted with that row. `preparation_targets` stores movie/episode identity
under a demand, unique by canonical target key. A TV demand has no fabricated episode target;
episode expansion belongs to #310 after trusted metadata discovery.

`preparation_attempts` stores an opaque ID token, target, adapter namespace, state, nullable upstream
reference and timestamps. At most one unresolved/accepted active attempt exists per target;
historical failures do not permit parallel submissions. Database constraints back the invariants.
State transitions use compare-and-set by token and current state. Generation/cache state stays
in #311; no sparse-file offsets or secret service settings appear in these tables.

Local target resolution is explicit: `needs_preparation`, `already_playable`, or `unresolved`.
Only a fresh trusted `needs_preparation` resolution admits a claim. Missing, stale or failed
probes resolve to `unresolved`, not absence. A series container with unknown episode inventory
cannot produce a resolved missing-episode target. #310 supplies the resolver integration.

The internal attempt states and allowed transitions are deliberately small:

| From | Event and required guard | To |
|---|---|---|
| No active attempt | Atomic claim: eligible interest, fresh needs-preparation resolution, no active token | `uncertain` |
| `uncertain` | Matching token and validated upstream acceptance/reference | `accepted` |
| `uncertain` | Matching token, original dispatcher fenced and authoritative provider nonacceptance proof | `retired` |
| `accepted` | Matching token, terminal upstream state reconciled, generation/reader protection authorizes retirement | `retired` |

`retired` is terminal and immutable. Duplicate identical acceptance is idempotent; conflicting
references, old tokens and every unlisted transition are refused. Claim and acceptance remain
blocked after restart when proof is absent. Retirement of an accepted generation is wired only
with #311's guarded lifecycle; #309 does not retire accepted jobs merely because a wish vanished
or a cache file looks missing. Retirement atomically invalidates local resolution; a later claim requires a new trusted probe
and creates a different token, retaining history. This prevents reuse of a pre-completion
missing-file result after the completed job has changed local availability.

Use the existing SQLite/Drizzle migration mechanism. Migration groups existing title keys and assigns random opaque IDs once; persisted identities
remain stable on subsequent opens through the migration journal and uniqueness constraints; it does not backfill readiness or notifications.
Cascade profile/wishlist deletion only into private interests, never shared work. Migration
tests start from an actual prior database containing multiple users and wishes.

HTTP validation and profile ownership remain in Discover routes. A small preparation request
repository owns local transactions, injected DB/clock/ID generation, and explicit attempt
transitions. Avoid a pass-through service layer and speculative plugin framework. Server-only
read methods return bounded results; no route exposes all subscribers or upstream references.

## Decision record

Weights total 100; scores 0–5; every option must preserve wishlist success independently of
external service availability. A is a durable local intent; B submits synchronously during PUT;
C saves only an in-memory queue. Scores are engineering judgments, not measured performance.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Restart/uncertain-write safety | 35 | 5 — transactional intent and token | 2 — crash after remote write is ambiguous | 0 — pending work lost |
| Private/shared identity correctness | 25 | 5 — constrained relations | 3 — needs equivalent extra persistence | 2 — process-local deduplication |
| Fast, service-independent wishlist | 20 | 5 — local commit only | 1 — waits for remote response | 5 — local enqueue |
| Implementation simplicity | 20 | 3 — small durable repository | 4 — existing POST seam | 5 — smallest queue |
| Total /500 | 100 | **460** | **245** | **250 — excluded: loses demand** |

A wins. Sensitivity: restart weight 35→15, others rescaled by 85/65 gives A 447.69,
B 258.85, C 326.92; weight 35→55, others rescaled by 45/65 gives A 472.31,
B 231.15, C 173.08. C remains excluded regardless of scores. Recommendation: A.

## Policy and observability

All currently authenticated users may record their own wishlist intent under the owner's
accepted policy. The current account model cannot identify a child; do not claim parental
enforcement or silently infer adulthood from the viewer role. Until #316, the first live
trial uses only explicitly chosen adult test accounts; child onboarding and household rollout
wait for the account-policy milestone. This operational restriction is not a parental control.

Structured info events cover created/reused/detached interest and attempt transitions; warn
events identify categorical failed/uncertain reconciliation. Use opaque demand/attempt IDs,
transition reason and bounded durations. Do not log titles, profile names, credentials, URLs,
raw provider bodies or polling success on every tick. Unexpected database errors propagate to
existing request error handling; they must not become a successful 204 response.

Tests use real SQLite repositories and migrations; fake clock/IDs and external-service doubles
only at boundaries. The case table is [adaptive wishlist requests](../qa/cases/adaptive-wishlist-requests.md).
No test execution or coverage percentage is claimed by this specification.

## Four-pass design review

- Requirements: REQ-10/12/22/23/25/29 map to private interests, shared targets and durable attempts.
  #310 owns actual service IO; #311 owns playable-byte validation and generation protection.
- Dependencies/SOLID: route authorization and persistence are distinct; remote IO stays outside
  local transactions. No domain dependency on qBittorrent or Seerr credentials.
- Simplicity: reuse wishlist, SQLite and auth; only distinct lifecycle identities get tables.
  No distributed queue, registry or new public API is introduced for future use alone.
- Failure/pattern review: a durable intent plus compare-and-set attempts addresses a present
  crash/duplicate risk. An upstream absence proof remains a provider contract, not an assumption.

Independent adversarial design review found two Must and two Should items, corrected and
reverified with Must 0 / Should 0: dispatcher fencing, unknown local-resolution handling,
explicit attempt transitions and authoritative #309/#310 scope. The owner validated this
concrete contract before coding; this document does not authorize deployment or service writes.

## Implementation scope and verification

Migration 0011 creates demand, interest, exact target and attempt tables and backfills existing
wishes without service IO. Runtime additions use UUIDs; migration backfill uses random 128-bit
hex IDs. IDs are opaque, never parsed or tied to backend names. The current HTTP surface stays
unchanged; an owned PUT commits wish plus interest atomically and returns 204 only on success.
SQL errors are replaced with categorical logging before reaching the HTTP error handler, to
avoid logging private title facts carried in Drizzle query parameters.

`PreparationRequestRepository` implements only local trusted-boundary transitions. Its boolean
retirement evidence is an internal assertion from a future verified adapter, not proof that a
real provider is idempotent. No public route accepts it. Actual dispatch/fencing/provider-finality
and local-playability adapters remain #310/#311, with their integration tests still pending.
Two-connection tests prove persisted sequential arbitration, not simultaneous process contention.
