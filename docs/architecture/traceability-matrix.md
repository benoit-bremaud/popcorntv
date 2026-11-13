# Architecture traceability matrix

Incremental adaptive-wishlist design index; no historical coverage claim. IDs REQ-1–8, NFR-1–4 and UC31 are reserved by the separate #128 local design branch. Integration must retain both sets of rows. The complete business cases below remain planned; bounded #308 experimental evidence is tracked separately and does not mark them implemented.

| UC or NFR | Source | Requirements | Realizations | Components | Classes | States | Data flow | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| UC32 | #307 / epic #306 | #307 → REQ-9; #307 → REQ-10; #307 → REQ-11; #307 → REQ-12; #307 → REQ-13; #307 → REQ-14; #307 → REQ-15; #307 → REQ-16; #307 → REQ-17; #307 → REQ-20; #307 → REQ-22; #307 → REQ-23; #307 → REQ-24; #307 → REQ-25 | REQ-9 → SEQ-follow-wishlist; REQ-10 → SEQ-follow-wishlist; REQ-11 → SEQ-follow-wishlist; REQ-12 → SEQ-follow-wishlist; REQ-13 → SEQ-follow-wishlist; REQ-14 → SEQ-follow-wishlist; REQ-15 → SEQ-follow-wishlist; REQ-16 → SEQ-follow-wishlist; REQ-17 → SEQ-follow-wishlist; REQ-20 → SEQ-follow-wishlist; REQ-22 → SEQ-follow-wishlist; REQ-23 → SEQ-follow-wishlist; REQ-24 → SEQ-follow-wishlist; REQ-25 → SEQ-follow-wishlist | Wishlist, Preparation coordinator, Recovery boundary, Cache boundary, Readiness policy, Notification store | n/a — analysis concepts only, classes deferred until #308 | Preparation lifecycle | Adaptive wishlist DFD | REQ-9 → T-9; REQ-10 → T-10; REQ-11 → T-11; REQ-12 → T-12; REQ-13 → T-13; REQ-14 → T-14; REQ-15 → T-15; REQ-16 → T-16; REQ-17 → T-17; REQ-20 → T-20; REQ-22 → T-22; REQ-23 → T-23; REQ-24 → T-24; REQ-25 → T-25 | draft, not executed |
| UC33 | #307 / epic #306 | #307 → REQ-18; #307 → REQ-19; #307 → REQ-21 | REQ-18 → SEQ-play-prepared-title; REQ-19 → SEQ-play-prepared-title; REQ-21 → SEQ-play-prepared-title | Bell and player, Preparation coordinator, Cache boundary, Playback boundary | n/a — analysis concepts only, classes deferred until #308 | Preparation lifecycle | Adaptive wishlist DFD | REQ-18 → T-18; REQ-19 → T-19; REQ-21 → T-21 | draft, not executed |
| NFR-5 | #307 | #307 → NFR-5 | NFR-5 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-5 → T-NFR-5 | draft, not executed |
| NFR-6 | #307 | #307 → NFR-6 | NFR-6 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-6 → T-NFR-6 | draft, not executed |
| NFR-7 | #307 | #307 → NFR-7 | NFR-7 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-7 → T-NFR-7 | draft, not executed |
| NFR-8 | #307 | #307 → NFR-8 | NFR-8 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-8 → T-NFR-8 | draft, not executed |
| NFR-9 | #307 | #307 → NFR-9 | NFR-9 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-9 → T-NFR-9 | draft, not executed |
| NFR-10 | #307 | #307 → NFR-10 | NFR-10 → spec §6 and component/DFD views | Preparation coordinator and relevant IO boundaries | n/a — no concrete classes selected | Generation and lease constraints | Adaptive wishlist DFD | NFR-10 → T-NFR-10 | draft, not executed |

## Planned functional cases

| ID | Required behavior | Delivery |
|---|---|---|
| T-9 | Catalog/provider presence never creates an in-app-ready event. | #308–#314 as mapped by REQ-9; consolidated #315 |
| T-10 | Concurrent profile wishes share one authorized intent without leaking subscribers. | #308–#314 as mapped by REQ-10; consolidated #315 |
| T-11 | Fake daily clock, early ticks, missed days and restart preserve one due search. | #308–#314 as mapped by REQ-11; consolidated #315 |
| T-12 | No source stays pending and uncertain submission reconciles without duplicate writes. | #308–#314 as mapped by REQ-12; consolidated #315 |
| T-13 | Sparse preallocation and dispersed pieces fail verified contiguous coverage. | #308–#314 as mapped by REQ-13; consolidated #315 |
| T-14 | Absent metadata, unsupported codec or insufficient startup bytes stay preparing. | #308–#314 as mapped by REQ-14; consolidated #315 |
| T-15 | Fast/slow/equal/oscillating/stale/VBR traces exercise warm-up, latch and hysteresis. | #308–#314 as mapped by REQ-15; consolidated #315 |
| T-16 | Complete corrupt or unsupported content stays unready, complete valid content may start. | #308–#314 as mapped by REQ-16; consolidated #315 |
| T-17 | Coverage or telemetry loss revokes new starts without killing pinned active playback. | #308–#314 as mapped by REQ-17; consolidated #315 |
| T-18 | Unready request refuses start, valid lease serves only verified bytes and expires bounded waits. | #308–#314 as mapped by REQ-18; consolidated #315 |
| T-19 | Seek, disconnect, completion/import and source replacement do not splice or prematurely end streams. | #308–#314 as mapped by REQ-19; consolidated #315 |
| T-20 | Crash around ready/notification transaction and repeated observations create one profile notice. | #308–#314 as mapped by REQ-20; consolidated #315 |
| T-21 | Reopen loads unread notice and exact-target Play rechecks stale generation/access. | #308–#314 as mapped by REQ-21; consolidated #315 |
| T-22 | Removing one interest preserves shared work and leases, last-interest cancellation never deletes files. | #308–#314 as mapped by REQ-22; consolidated #315 |
| T-23 | Restart reconciles unfinished writes/cache before readiness without duplicate submissions. | #308–#314 as mapped by REQ-23; consolidated #315 |
| T-24 | Missing original/French audio or usable French subtitles prevents readiness, including per-episode checks and original French audio satisfying both roles. | #308, #311–#314 |
| T-25 | Each authenticated own-profile wish triggers automatic preparation without per-wish owner approval when account parental policy permits; anonymous/cross-profile intent and forged upstream-user overrides are refused. | #309 |

## State transition case derivation

T-10 covers automatic pending intent creation and initial private interest. T-25 covers signed-in-user access and rejection of anonymous/cross-profile requests without an approval state. T-11 covers pending → searching and rejected early/admission events. T-12 covers searching → pending/preparing/failed and uncertain writes. T-14–17 cover preparing → ready, healthy ready observations, full-file latch and ready → preparing/failed. T-22 covers guarded cancellation from every state and cancelled → pending on a new authorized follow. T-23 covers failed → pending for due transient/explicit resolved retry and restart reconciliation. Each case must be expanded per state/guard in the implementation test design; unknown events and stale generations are rejected/ignored as specified. These grouped design cases do not claim executable transition coverage.

## Planned non-functional cases

| Case | Required verification |
|---|---|
| T-NFR-5 | Cross-profile/acquisition/session authorization including automatic signed-in-user wishes and revised upstream service policy. |
| T-NFR-6 | Fixed destination, secret redaction, path escape, symlink/source substitution and no remote FFmpeg input. |
| T-NFR-7 | Finite queue/disk/session/wait limits and pinned-content protection under pressure. |
| T-NFR-8 | Crash/replay/concurrency tests for upstream intent and notification uniqueness. |
| T-NFR-9 | Deterministic throughput/range traces and controlled opt-in partial-media integration fixtures. |
| T-NFR-10 | No sensitive logs or profile/history egress, documented retention and private unread counts. |

Realizations: [UC32 sequence](diagrams/adaptive-wishlist/02-sequence-follow-wishlist.md), [UC33 sequence](diagrams/adaptive-wishlist/02-sequence-play-prepared-title.md), [components](diagrams/adaptive-wishlist/03-component.md), [states](diagrams/adaptive-wishlist/05-state-preparation.md), [DFD](diagrams/adaptive-wishlist/06-data-flow.md), [specification](specs/adaptive-wishlist-lifecycle.md).

## Child invitation extension (UC15)

| Source and requirement | Realization | Responsibility | Planned verification | Status |
|---|---|---|---|---|
| #307 owner clarification → REQ-26 | Existing UC15 invitation/redeem sequence, to be extended by the child-account prerequisite | Account and child invitation policy | T-26: invite/redeem tampering, expiry, reset, child role and profile-switch bypass | requirement captured; detailed child interaction pending |
| #307 owner clarification → REQ-27 | UC32/UC33 sequences with account-policy guards, child enforcement interaction to be specified | Account policy, Wishlist, coordinator and playback | T-27: restricted/unknown rating, shared adult preparation, direct ID, notifications and policy edits across sessions | requirement captured; design pending |

The child prerequisite must add its concrete sequence/API/data model and tests before implementation. These rows do not claim the child feature is fully designed.

## Bounded experimental evidence (#308)

The [QA ledger E308-01–16](../testing/qa-matrix.md#progressive-recovery-experiments-308-2026-11-12)
and [combined experiment report](qa/2026-11-12-issue-308-combined.md) track observations for
T-13/T-18/T-19/T-24 and resource/secret boundaries. They establish limited media mechanics,
not implementation of UC32/UC33 or the readiness/notification state machine. T-9–12, T-14–17,
T-20–23, T-25–27 and full NFR coverage remain pending their implementation bricks.

The [2026-11-13 recovery report](qa/2026-11-13-issue-308-recovery.md) adds E308-17–21:
real slow/full-file behavior, controlled partial restart and immutable-inode rename. T-23 gains
backend persistence evidence only; preparation-state reconciliation remains unimplemented.
T-14 readiness and full NFR coverage remain pending, as do the final unknown-file range contract
and adoption decision. No additional business use case is marked implemented.

The [proposed conclusion](qa/2026-11-13-issue-308-conclusion.md) and ADR-0034 map E308-22–24
to standalone piece-hash validation and admission boundaries. They specify the future #311–#313
contract; they do not implement UC32/UC33, unknown-file browser scheduling or readiness notifications.
Owner validation of weights and contract remains pending before research closure/adoption.
