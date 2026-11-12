# Adaptive wishlist — preparation and playback lifecycle

Design draft for [#307](https://github.com/benoit-bremaud/popcorntv/issues/307), first brick of epic [#306](https://github.com/benoit-bremaud/popcorntv/issues/306).

**Status:** owner goals confirmed in conversation; this design and its open decisions await owner review. No runtime implementation, test execution, deployment or backend feasibility is claimed.

## 1. Evidence and scope

Owner goals: discover new movies/series even when not playable, retain personal wishlist entries, search waiting titles daily without an open browser, prepare media automatically and store an in-app bell notification when playback can start. Recovery slower than consumption means waiting for the complete file. Sufficiently faster sustained recovery may permit progressive playback with a safe contiguous buffer. One-third completion is not the readiness rule. Permanent retention policy is deferred.

Verified in this checkout by reading code:

| Existing element | Actual responsibility | Gap |
|---|---|---|
| `discover/wishlist-repository.ts` | Profile/title wishlist and local movie/series TMDB match | No preparation, episode target or source identity |
| `discover/availability-check.ts` | Local presence/provider-offer changes | Neither probes playability nor verifies partial ranges |
| `discover/notification-repository.ts` | Persistent profile notifications | No readiness generation or episode target |
| `NotificationBell.tsx` | Load on profile selection, poll every five minutes, mark read, open title | No progressive playback handoff |
| `timer.ts` | Serial interval with stop-and-await | No persisted due dates or crash reconciliation |
| `playback/routes.ts`, `session-routes.ts` | Confined complete-file range serving and local FFmpeg sessions | A preallocated partial file cannot safely use these assumptions |

Paths above are relative to `apps/server/src/`, except the bell under `apps/web/src/discover/`.
Manual owner-only Seerr submission (#128) exists as local commit `283a1e5` on a separate branch; it is not integrated into this branch or validated. Its ADR-0032, UC31 and REQ-1–8/NFR-1–4 are reserved: new identifiers below start after them. Do not interpret branch-local code as an installed service.

This draft expands the earlier coexistence-only product boundary. It does not silently supersede existing vision, local-only FFmpeg input policy or owner-only submission permissions. The accepted implementation dossier must update those documents together before changing runtime behavior. The owner has now explicitly requested automatic acquisition for every signed-in user; #128's manual owner-only endpoint is historical behavior, not the target permission policy.

## 2. Actors, use cases and domain concepts

Stakeholders: owner (authorization, storage and operations), viewer (personal wishlist and playback), household members (shared resources with isolated preferences). External recovery services see approved title/source identities, not PopCornTV profile names or watch history.

**UC32 Follow a title until it is playable** — user goal across visits.
- Primary actor: signed-in viewer with their own profile. Supporting actor: owner for configuring the service and resource budgets; no per-wish manual approval.
- Trigger: add a Discover title to the personal wishlist.
- Preconditions: authenticated profile access, valid movie/series identity. Every signed-in user may automatically request preparation for their own wishlist, within server admission limits, account-level parental policy and configured service permissions.
- Main scenario: save interest; link an existing preparation or create an automatically authorized signed-in-user intent; search due waiting targets; select an acceptable source; prepare temporary media; evaluate readiness; atomically persist the readiness transition and one notification per eligible subscription.
- Success: the wish remains tracked and its exact playable target has a persistent notification. Minimal guarantee: failure never fabricates readiness or loses the wishlist.
- Extensions: no source remains pending; anonymous or cross-profile attempts are refused; admission/configuration failure stays visible and does not erase the wish; uncertain upstream submission is reconciled, not blindly repeated; missing storage pauses preparation; transient service failure records backoff; removal detaches only that profile.

**UC33 Watch a prepared wishlist title** — user goal in one viewing session.
- Trigger: open a ready notification and choose Play.
- Preconditions: profile owns the notification and still has access to its target.
- Main scenario: recheck generation, cache and readiness; pin verified media; start the accepted playback mode; continue recovery while viewing; release the pin on session close.
- Success: playback starts at the intended movie/episode and can continue using available media. Minimal guarantee: no cache hole is served as media and no outside path is read.
- Extensions: readiness lost shows preparation rather than a broken Play promise; seek outside coverage waits with a bounded deadline or reports unavailable; source outage buffers and eventually reports a recoverable error; full-file completion/import does not change bytes beneath an active reader.

Analysis model (not a database schema): **Wishlist interest** belongs to a profile and a title; **Preparation** belongs to one movie or episode target and has many interests; **Source candidate** identifies acceptable recoverable content; **Readiness snapshot** records verified coverage, metadata, telemetry freshness and policy version; **Ready notification** links a profile subscription and preparation generation; **Playback lease** pins content for a session. Subscription/notification privacy remains independent of shared bytes.

## 3. Functional requirements

| ID | Contract | Delivery |
|---|---|---|
| REQ-9 | Keep catalog/release visibility separate from acquisition and playability. Existing provider notifications never imply in-app playback. | #307, #314; Discover #183/#189 |
| REQ-10 | Persist personal interest, authorized preparation intent and linkage. Deduplicate movie/episode preparations across profiles without leaking subscribers. | #309 |
| REQ-11 | Search pending authorized targets at most once per rolling 24 hours in normal operation; persist due dates, serialize runs and reconcile overdue work without a catch-up burst. Acquisition provider scheduling must not duplicate this search. | #310 |
| REQ-12 | Keep no-source targets pending. Validate source identity and accepted language/quality/subtitle constraints; reconcile uncertain writes before another submission. | #308–#310 |
| REQ-13 | Persist target/source/generation, progress and verified ranges in a bounded temporary disk cache, separately from permanent media. File length or total percentage never proves playable coverage. | #311 |
| REQ-14 | Require valid container metadata, a supported decode path, fresh verified contiguous startup coverage and sufficient resource capacity before progressive readiness. | #308, #312 |
| REQ-15 | Use sustained conservative recovery speed versus estimated media consumption with a safety margin, warm-up and hysteresis. Slower recovery selects full-file-only for that preparation attempt. Unknown/unstable evidence waits conservatively. | #312 |
| REQ-16 | A complete file becomes ready only after validation of identity, usable streams, accessible bytes and supported playback mode. Completion alone is not validation. | #311–#313 |
| REQ-17 | Continue observing active transfers at a separately bounded cadence. Readiness loss updates the state and prevents new sessions; an active session handles its own buffer rather than being killed by a status flip. | #311–#313 |
| REQ-18 | Start playback only after a server recheck and cache pin. Wait only within bounded verified-range/segment rules, never serve holes or mistake temporary starvation for final EOF. | #313 |
| REQ-19 | Define seeks into pending data, disconnect, resume, completion/import and stale generations explicitly. Never splice a replacement source into an existing stream. | #313 |
| REQ-20 | Atomically persist a ready transition and per-profile notification with a uniqueness key based on subscription, target and content generation. Ordinary ready/waiting oscillation does not notify repeatedly. | #314 |
| REQ-21 | Load unread persistent notices at next profile opening. An exact-target Play action must recheck readiness; a historical unread notice may show preparing if conditions changed. | #314 |
| REQ-22 | Removing a wish detaches its subscription only. Pending work with no interest may be paused, but another subscriber or active playback lease prevents cancellation/eviction. No automatic file deletion is authorized here. | #309, #311 |
| REQ-23 | On restart, reconcile persisted state with the backend and actual bytes before restoring readiness; suppress external submissions until their previous outcome is known. | #309–#314 |

### Owner clarifications recorded during #307

Confirmed in conversation after the first draft:
- Notify **each new episode** when it becomes ready. Series-level interest fans out to episode targets, each with its own generation, state and notification uniqueness key. Neither a series row nor a season acquisition result proves episode readiness.
- Prepared media must offer **original audio and French audio, plus French subtitles**. Original French audio can satisfy both language roles; the roles do not require duplicate identical tracks. Missing required language/subtitle coverage means pending/preparing with a clear reason, not ready. No silent fallback to a different language. Source tags alone do not prove actual usable tracks. Subtitle paths must be supported by the player (existing sidecar follow-up #186); downloading an unreadable subtitle is insufficient.
- **All signed-in users**, subject to owner-configured child-account restrictions, trigger automatic preparation by adding to their own wishlist, without an owner approval step. Anonymous/cross-profile writes remain denied. Server admission/resource controls still apply. #309 must revise the previous owner-only acquisition boundary, including accepted credentials/service permissions, before enabling this route. Do not forward browser-controlled upstream user or administrator override settings.

| ID | Contract | Delivery |
|---|---|---|
| REQ-24 | Validate original and French audio plus usable French subtitles before readiness, at movie/episode granularity, with explicit missing-language state. | #308, #311–#314; related #186 |
| REQ-25 | Each signed-in user's own wishlist addition triggers automatic preparation without per-wish owner approval when account-level parental policy permits; enforce profile ownership, bounded admission and a revised safe service authorization boundary. | #309 |

### Child accounts and invitation settings (owner requirement)

The owner requested a child account configurable when issuing its invitation, including the example of a seven-year-old child. Current `AdminPanel.tsx` invitation creation chooses only an owner/viewer role, `auth_tokens` stores that role, and redeem creates a user from it; there is no parental policy in this checkout. This requires a dedicated authorization/authentication follow-up #316 before enabling automatic acquisition for child accounts.

Required product capabilities:
- The owner can designate an invitation as a child account and configure its parental policy before issuing the single-use link. Invitation acceptance cannot edit or weaken that policy; redemption transfers it atomically to the created account. Revocation, expiration and password-reset flows cannot erase restrictions.
- Account type and parental policy are distinct from administrative role. A child is never an owner; switching profiles or creating another profile under the account cannot widen access. Subsequent owner edits apply to existing sessions and preparation/playback checks.
- Configuration must cover permitted age/classification ceiling and whether automatic wishlist acquisition is enabled for that child. The example of seven years is a configuration use case, not evidence that any particular rating is suitable. No birth date is required solely to impose a chosen ceiling.
- Enforce policy server-side on Discover/search/details, direct target access, wishlist, automatic source selection, notifications and playback, not just a hidden UI section. Shared prepared bytes never grant a restricted account access to an adult's title.
- Unknown/missing/conflicting classifications need an explicit conservative policy. Classification region/source, override behavior, default acquisition permission and treatment of existing library files require owner validation. No unclassified content is silently assumed child-safe.
- A policy change invalidates unauthorized queued preparations/subscriptions and prevents new playback immediately; the treatment of an already active child session must be defined and tested. Other permitted subscribers keep shared content.

| ID | Contract | Delivery |
|---|---|---|
| REQ-26 | Owner-configured child invitation policy survives single-use redemption atomically and cannot be changed by the recipient or bypassed through profiles/role/reset flows. | #316 child-account prerequisite, before #309 |
| REQ-27 | Parental rules govern discovery, wishlist acquisition, notifications and playback on the server, including unknown classifications, policy changes and shared content. | #316, #309, #313, #314 |

Child policy design is not yet accepted. Retain automatic acquisition for eligible adult accounts, but do not roll out unrestricted child auto-acquisition while parental controls are absent.

## 4. Readiness contract

Inputs: verified contiguous playable-time coverage from the selected start position, required metadata/index ranges, estimated consumption including selected audio/container overhead, sustained recovery samples, sample age, completion/integrity status, source generation, disk and session capacity. Speeds use bytes per second internally; bit-rate conversion is explicit. Movie duration and average bytes/duration are insufficient guarantees for variable-rate content.

Candidate policy, **parameters pending #308 measurements and owner validation**:
- Full-file-only latch: confirmed sustained recovery below estimated consumption makes this attempt wait for full validation. A later retry/new source is a new explicit generation, not silent oscillation back into progressive mode.
- Progressive eligibility: known supported media and startup metadata, fresh stable measurements, conservative recovery estimate above consumption by a positive margin, enough contiguous playable time, and a conservative estimate that coverage remains ahead through completion. Merely seeing a favorable instantaneous rate is insufficient.
- Uncertain, equal-rate, unstable or stale inputs: remain preparing, without resetting the job or notifying.
- Completed input: ignore obsolete download speed but require the full-file checks of REQ-16.
- Recheck on every bounded telemetry update and immediately before a new playback lease. No network forecast guarantees stall-free playback under a future outage.

No fixed buffer duration, speed ratio, polling period or prediction window is presented as proven. #308 must measure feasibility and #312 must specify and test numeric bounds before implementation. Ready is an operational estimate with a revocable precondition, not a promise that an external source cannot fail.

## 5. State and event semantics

Authoritative draft: [preparation state machine](../diagrams/adaptive-wishlist/05-state-preparation.md). Proposed public states: `pending`, `searching`, `preparing`, `ready`, `failed`, `cancelled`. Searching is a bounded attempt. Playback is a separate leased activity, not a preparation state. Full-file-only is a readiness-policy latch, not a second parallel lifecycle.

Ready includes validated complete and eligible progressive media; the snapshot records which. Backend observation loss/coverage loss invalidates ready. Failed stores a sanitized reason and retry eligibility, not raw exceptions. Transient failures wait for the persisted retry time; owner action is required for permanent/configuration errors.

A generation changes only when selected source/content changes or a genuinely new attempt is explicitly created. Restart alone and telemetry fluctuations retain it. Notification uniqueness is durable across crashes. A later subscriber can receive one initial ready notice under the same generation; unread count remains private.

## 6. Resource, security and privacy requirements

| ID | Measurable acceptance condition |
|---|---|
| NFR-5 | Every acquisition submission and cache/session read enforces server authorization; cross-profile probes reveal no wishlist, path, credential or subscriber. User-triggered recovery must use the explicitly accepted service policy, never silently inherit the Seerr administrator's unrestricted permission. |
| NFR-6 | Backend destinations are fixed server configuration, with validated timeouts/body limits and sanitized errors. No arbitrary URL or path from browser/metadata reaches FFmpeg, a shell or filesystem read. Required outbound source destinations are constrained by the selected backend design. |
| NFR-7 | Finite cache bytes, reservation rules, concurrent preparations/sessions, telemetry cadence, per-run jobs and wait deadlines are required before runtime admission. Disk full refuses/pauses new work without deleting permanent files or pinned cache. Concrete limits are validated in #308/#311. |
| NFR-8 | Restart replay and concurrent reconciliation create at most one upstream intent and one notification per uniqueness key; inject crashes around each persistent transition and verify recovery. |
| NFR-9 | Policy tests use deterministic clocks/range and throughput traces; no real service is required for unit/contract tests. Integration fixture exercises fast/slow/unstable recovery, sparse holes, seek, restart and pressure before progressive mode is released. |
| NFR-10 | Logs contain operational IDs/reasons only, no raw bodies, credentials, profile wishes or watch history. Profile interest stays local; external title/source choices remain sensitive preferences. Notification history inherits the existing 90-day rule unless explicitly revised. Cache metadata cleanup/retention is an open decision, never indefinite by accident. |

Threats/mitigations: confused-deputy acquisition → owner authorization; guessed preparation IDs → per-session/profile checks; source path traversal/symlink swap → confined stable descriptor access; sparse-file disclosure → verified ranges; source substitution → generation binding; disk/CPU abuse → finite admission; duplicate background writes → reconciliation/idempotency; cross-profile leakage → private subscriptions; secret leaks → minimal validated responses and safe logging. See [DFD](../diagrams/adaptive-wishlist/06-data-flow.md).

## 7. Component responsibilities and delivery boundaries

[Component view](../diagrams/adaptive-wishlist/03-component.md). Proposed responsibilities, **not prescribed classes or a generic framework**:
- Wishlist routes/repository: authorized private interests and linkage.
- Preparation coordinator: persisted lifecycle, due work, selected source and completion reconciliation; does not implement codec or indexer protocols.
- Recovery boundary: submit/reconcile/observe/prioritize through the chosen backend, replaceable by a test double. Protocol and installation remain #308 decisions.
- Readiness policy: pure telemetry-to-decision function; imports no Fastify, database, HTTP client or filesystem.
- Cache boundary: confined verified reads, quotas and lease protection; never pretends to be the permanent library.
- Playback boundary: safe partial-media session and starvation/seek rules; reuse complete-file/HLS paths only when their invariants hold.
- Notification repository/bell: durable per-profile outcomes and exact-target handoff.

Persistence shape and HTTP contracts are intentionally deferred to their implementation bricks, after the protocol spike. No new service bus, generic provider system or repository layer is justified solely by this draft.

## 8. Decisions still requiring owner input

| ID | Unresolved point | Safe boundary until resolved |
|---|---|---|
| RESOLVED-1 | Notification granularity | Owner selected each new ready episode. Movie and episode identities are independent. |
| RESOLVED-2 | Who may trigger acquisition? | Every signed-in user, automatically from their own wishlist, without manual approval. Technical service authorization must be revised in #309. |
| OPEN-3 | Quality and acceptable size remain to choose | Language roles resolved: original audio and French audio with French subtitles. Quality/size and cache fit remain to specify. |
| OPEN-4 | Disk budget, simultaneous preparations, tolerated startup wait, target Pi model/storage? | No unlimited cache and no unmeasured numeric thresholds. |
| OPEN-6 | Child-account defaults, classification region/source and active-session revocation behavior | Invitation options required; no unrestricted child rollout before accepted policy and enforcement. |
| OPEN-5 | Which backend and protocols support the required verified ranges and playback formats? | #308 go/no-go, then decision and revised implementation plan. |

These are requirements questions, not hidden defaults. The entire design remains draft until reviewed. Retention/automatic deletion is a separate later scope; readiness must still be invalidated if media disappears.

## 9. Traceability, planned verification and review

[Matrix](../traceability-matrix.md) pairs each requirement with a realization and planned tests. Test IDs are design cases, not executed test results. UC32 uses [SEQ-follow-wishlist](../diagrams/adaptive-wishlist/02-sequence-follow-wishlist.md); UC33 uses [SEQ-play-prepared-title](../diagrams/adaptive-wishlist/02-sequence-play-prepared-title.md).

Four-pass self-review on 2026-11-12:
1. Need/traceability: daily search, persistent bell, adaptive readiness and temporary storage are represented. Episode notifications, language roles and automatic signed-in-user requests are resolved. Child invitation controls were subsequently requested. Quality/size, parental defaults, capacity and backend evidence still block claiming a complete runtime contract.
2. Dependencies/SOLID: pure readiness has inward dependencies; external IO is injected; private interest and shared bytes are distinct responsibilities.
3. Simplicity: reuse bell, auth and serial-timer conventions, add persisted due dates only where restart semantics require them; no framework or irreversible cleanup.
4. Pattern fit/risks: only external IO seams justify ports. Unverified partial-media support is the first technical gate; no source or throughput forecast is treated as guaranteed.

No independent review, diagram renderer run or runtime check has been performed. Tests are to be written with the subsequent bricks and run during final local validation per the owner workflow. The #308 targeted feasibility experiment must be explicitly authorized before downstream runtime assumptions are accepted.
