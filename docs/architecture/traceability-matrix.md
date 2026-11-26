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

The accepted #309 refinement is [durable preparation requests](specs/adaptive-wishlist-requests.md).
Its [case table](qa/cases/adaptive-wishlist-requests.md) expands T-10/T-12/T-22/T-23/T-25
and REQ-29 into TC-01–21 for transactional demand, profile privacy, restart and attempt
reconciliation. Repository/API cases are implemented; external-provider and local-playability adapter cases remain deferred to #310/#311. The revised #306 sequence validates the
complete-file path first; #316 follows progressive implementation and precedes final validation.

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
T-14 readiness and full NFR coverage remain pending, while the final range/generation design is accepted in ADR-0034 but not implemented. No additional business use case is marked implemented.

The [accepted research conclusion](qa/2026-11-13-issue-308-conclusion.md) and ADR-0034 map E308-22–24
to standalone piece-hash validation and admission boundaries. They specify the future #311–#313
contract; they do not implement UC32/UC33, unknown-file browser scheduling or readiness notifications.
The owner validated A and the weights/contract on 2026-11-13; final publication/merge checks remain.


## Source diversity extension — 2026-11-13

| Source and requirement | Realization | Responsibility | Planned verification | Status |
|---|---|---|---|---|
| Owner clarification → REQ-28 | ADR-0034 diversity boundary and lifecycle UC32 discovery | #310 scheduler/service boundary with Prowlarr | T-28: two configured indexers, one outage, duplicate publications, backoff and policy filtering | accepted requirement; runtime/tests planned |
| Owner clarification → REQ-29 | ADR-0034 client-independent preparation identity | #309–#311 persistence/cache; future #325 second adapter | T-29: namespaced backend references, uncertain old submission, alternate capability and protected generation | accepted requirement; second backend deferred |

T-28/T-29 are design cases, not claimed executable tests. Indexer and retrieval-engine diversity
remain separate; native libtorrent fallback does not itself add another acquisition provider.

## Signed local gate design — 2026-11-14

| Source and requirement | Realization | Responsibility | Planned verification | Status |
|---|---|---|---|---|
| #329 → REQ-30 | SEQ-attest-local-gate | Local gate recipes and toolchain | Cases TC-01, TC-11, TC-13 in [signed local gate](qa/cases/329-signed-local-gate.md) | implemented; PR #340, checked e7e555e |
| #329 → REQ-31 | SEQ-attest-local-gate | Local gate and SSH signer, canonical repository transport | Cases TC-01–05, TC-08–10, TC-14–15 | implemented; real signature verified, PR #340 |
| #329 → REQ-32 | SEQ-attest-local-gate | Local checks and evidence publication | Cases TC-06–08, TC-10, TC-14 | implemented; failed d748f1d retained, corrected e7e555e passed |
| #329 → REQ-33 | Local gate protocol resource contract | Bounded test runner and pinned runtime | Cases TC-11–12 | implemented; 1,447 application tests, zero skips, clean-shell pre-push 93.56 s |

The [protocol](specs/local-gate-protocol.md) and sequence describe the implemented workflow.
The [validation chronology](qa/2026-11-14-issue-329-local-gate.md) distinguishes original
failed runs from final exact-head signed evidence. PR #340 merged at 6a3c4ac; that new squash
commit needs its own gate before any authorized deployment. No deployment is claimed here.

## Local discovery implementation — 2026-11-15

| Source and requirement | Realization | Responsibility | Designed verification | Status |
|---|---|---|---|---|
| #327 → REQ-34 | Local deployment view, topology contract | Local operator and isolated services | [TC-01–03,05,07,10](qa/cases/327-local-discovery.md) | implemented locally; targeted real-container acceptance passed; final global gate deferred |
| #327 → REQ-35 | Local deployment view, protected-state contract | Initializer and authenticated local administration | TC-02–05,07,10 | implemented locally; targeted real-container acceptance passed; final global gate deferred |
| #327 → REQ-36 | Topology responsibility decision A | Future #310 trigger, Radarr executor, Prowlarr indexers | TC-06,08 | decision A approved; empty/RSS policy verified; #310 scheduling pending |
| #327 → REQ-37 | Empty/offline bootstrap boundary | Local discovery services, controlled fixtures | TC-01,04,06,09 | operator installation remains empty; disposable two-source/outage acceptance passed |

The [implemented topology](specs/local-discovery-topology.md) does not implement scheduling,
provider finality, VPN retrieval or playability. The controller and real-container cases verify
local discovery infrastructure; #310–315 retain the remaining workflow. The first-listen
authentication correction is in `bedfe9f`; global CI and merge remain pending owner
workflow #315 before deployment.

## Redesign (epic #401) — 2026-11-23

Started by #395. Each row traces a brief goal, non-functional requirement or job story to the
screens of the inventory (#396), the components of the system (#399) and the checks (#394,
#400, #411, #412). Columns fill in as each phase is validated by the owner. UC34, REQ-38–42 and
ADR-0035 belong to #328 (below); ADR-0038 is reserved by #315 (branch `feat/315-playable-retrieval-trial`); the redesign starts at UC35.

| Source | Requirement | Screens (#396) | Components (#399) | Verification | Status |
|---|---|---|---|---|---|
| [Brief](../requirements/04-redesign-brief.md) G1, G2 | Craft quality ≥ 34 / 40, no Must | S01–S19, R1–R3 ([inventory](specs/redesign-screen-inventory.md)) | All | `ui-review` per screen (#400) | draft |
| Brief G3, J6 | 1 activation from *Continue watching*, ≤ 2 from the hero | S06, S09, S10; flow F3 | Hero, row, card | Task test (#411), measure (#412) | draft |
| Brief G4, G5, NFR-11 | WCAG 2.2 AA, keyboard and remote complete, 44 px targets | All screens, states X4, X7; flows F1–F19 | All, focus system | axe, keyboard and remote pass, screen-reader smoke | draft |
| Brief G6, NFR-15, D1, D6 | TV layout: 5 % safe margin, body ≥ 28 px at 1920 × 1080, D-pad reach | State X7 of every screen; S17, S18 | Tokens, focus system | Remote pass on Android TV (#411, #417) | draft |
| Brief G9, NFR-12, NFR-13 | Core Web Vitals and bundle budget | S06, S09 | Build | Lighthouse trace, build budget check (#412) | draft |
| NFR-14 | No third-party request at run time | All screens; S11 (ADR-0040) | All | Network log per screen | draft |
| [J1](../requirements/05-discovery-interviews.md), D6 | Phone remote paired with the TV | S18, R1–R3; UC35, UC36; ACT-pair-phone-remote; flow F11 | Remote panel | Task test (#411); feature in #418 | draft |
| J3, D4, [ADR-0040](decisions/0040-play-local-trailers-and-hand-off-remote-ones.md) | Trailer on request only: local in-app, remote handed off | S09, S11; UC37; flow F7 | Trailer button and states | Network log, remote pass (#411) | accepted 2026-11-23 |
| J4, J8 | Children's profile, per-title owner override | S04, S06, S09; UC39; ACT-child-session; flow F13 | Profile badge, rating chip | Feature in #316 (per account, REQ-26, REQ-27) | draft |
| J5, D5 | Reliable playback, in-player audio and subtitles | S10; ACT-play-and-resume; flow F6 | Player controls, track panel | `ui-review` player, #415; D5 in #399 | draft |
| [ADR-0041](decisions/0041-give-views-and-titles-their-own-path.md) | One path per view and title | Paths in the [inventory](specs/redesign-screen-inventory.md) § 3 | Router module | Reload and Back tests (#400) | accepted 2026-11-23 |
| [Personas](../requirements/06-personas.md), [MoSCoW](../requirements/07-redesign-moscow.md) | Who each screen serves; what is in scope | Inventory columns MoSCoW and Personas | — | Owner validation | validated 2026-11-23 |
| [IA](specs/redesign-information-architecture.md) | Navigation tree from the card sort, checked by a tree test | S06, S07, S12, S16 grouping | Navigation | Tree test (§ 5) | draft |
| UC38 | Connect a TV without typing | S17; flow F12 | Pairing code | Feature in #200, #417 | draft |

## On-demand retrieval (epic #306 redefined, #434) — 2026-11-24

Replaces UC32, UC33, REQ-11, 15, 17, 20, 21, 22, 24 and 25 above
([§ Replaced items](../requirements/08-on-demand-retrieval.md#replaced-items)); the other #307
rows stay. Test IDs are design cases for the implementation issues, not executed results. All
automated cases use synthetic or local fixtures (NFR-17).

| Requirement | Use case, diagram | Decision | Test design | Slice | Status |
|---|---|---|---|---|---|
| REQ-46 prefetch on sheet, 6 h purge | UC40; SEQ-prefetch-and-play; stm Retrieved file; ACT-deletion | ADR-0043 | T-46: open twice → one retrieval; unplayed 6 h → purged; restart runs the overdue purge | 1 | accepted design |
| REQ-47 start buffer | UC40; SEQ-prefetch-and-play | ADR-0044 | T-47: traces fast, slow, equal, unknown, VBR; floor 30 s; cap and warning | 1 | accepted design |
| REQ-48 filling Play button | UC40 | ADR-0043 | T-48: fill follows verified bytes; progress exposed to assistive technologies | 1 | accepted design |
| REQ-49 early click priority | UC40; SEQ-prefetch-and-play | ADR-0043 | T-49: early Play outranks every prefetch; sheet stays until first frame | 1 | accepted design |
| REQ-50 progressive playback, stop on close, seek | UC40; SEQ-prefetch-and-play; stm Retrieved file | ADR-0034, ADR-0043 | T-50: only verified pieces served; close stops retrieval and keeps bytes; seek reorders | 1 | accepted design |
| REQ-51 48 h deletion | UC40; ACT-deletion; stm Retrieved file | ADR-0045 | T-51: finished and abandoned → deleted at 48 h; lease blocks; `MEDIA_ROOT` untouched | 1 | accepted design |
| REQ-53 ceiling and eviction | ACT-disk-pressure | ADR-0044 | T-53: ceiling = min(value, used + free − 15 %); eviction order; lease and favourite never evicted; refusal message; sliding window releases played pieces, pause when none | 1 | accepted design |
| REQ-54 version pick and degraded choice | UC43 | ADR-0046 | T-54: verdict reasons; fastest conforming; degraded only on choice; external French subtitles | 1 | accepted design |
| REQ-55 source acceptance | UC40; DFD | ADR-0046, ADR-0028 | T-55: any non-video, non-subtitle file rejects the source; every file probed confined | 1 | accepted design |
| REQ-56 failure pause and resume | UC40; SEQ-prefetch-and-play | ADR-0043 | T-56: source loss → buffer plays, pause, auto-resume, Retry; no egress without VPN | 1 | accepted design |
| REQ-57 priorities and quotas | UC40 | ADR-0043 | T-57: playback before prefetch; account limits; queued not dropped | 1 | accepted design |
| REQ-58 adults only, Tailscale same rules | UC40 | — | T-58: child account refused until #316 | 1 | accepted design |
| REQ-64 series | UC40 | ADR-0043 | T-64: next episode prefetch, per-episode deletion, countdown switch | 2 | accepted design |
| REQ-43–45 « À venir » and source notices | UC41 | ADR-0047 | T-43: only no-source titles; T-44: 6 h / daily / weekly cadence; T-45: one notice per profile, degraded said | 3 | accepted design |
| REQ-52 favourites first third | UC42; ACT-deletion; stm Retrieved file | ADR-0045 | T-52: add → third retrieved; trim 48 h after playback; kept while one profile has it | 3 | accepted design |
| REQ-59 channels | UC45; DFD | ADR-0047 | T-59: per-profile channels, digest, quiet hours delay push; no history in payload | 3 | accepted design |
| REQ-60, REQ-61 admin and statistics | UC44 | — | T-60: cancel activity; T-61: anonymous statistics, 90-day detail, monthly aggregates | 4 | accepted design |
| REQ-62, REQ-63, REQ-65 badges, search, phone | UC40 | — | Wireframes #398, #426, #417, #418 | redesign | accepted design |
| NFR-16 start targets | UC40 | ADR-0044 | Owner-run staging measurement | 1 | to measure |
| NFR-17 synthetic fixtures only | all | — | Gate review | all | accepted design |
| NFR-18 egress and privacy | DFD | ADR-0047 | T-NFR-18: network test, no profile data to sources or channels | 1, 3 | accepted design |
| NFR-19 retention | UC44 | — | T-NFR-19: retention sweep | 4 | accepted design |

## Persistent VPN retrieval — #328, 2026-11-26

UC34 and REQ-38–42 are defined in [the contract](specs/nordvpn-retrieval.md); test IDs refer
to the [designed cases](qa/cases/328-nordvpn-retrieval.md). No application class or data model
is added. Secrets cross only protected mounts, not application payloads.

| Source and requirement | Realization | Components and deployment | Tests | Status |
|---|---|---|---|---|
| #328 → REQ-38; REQ-56, NFR-18 (egress) | SEQ-start-retrieval; UC34 | Retrieval controller, Gluetun, qBittorrent; local deployment | TC-02–05/09 | implemented; component-tested, runtime acceptance owner-run and pending |
| #328 → REQ-39 | SEQ-start-retrieval; UC34 | Retrieval controller, protected file mounts, authenticated client | TC-01/02/07 | implemented; component-tested, runtime acceptance owner-run and pending |
| #328 → REQ-40; REQ-51 (`MEDIA_ROOT` untouched) | Hard quota, process limits, `MEDIA_ROOT` refusal | Retrieval controller, dedicated filesystem; local deployment | TC-08/09/11 | implemented; component-tested, runtime acceptance owner-run and pending |
| #328 → REQ-41 | SEQ-start-retrieval; UC34 failure and recovery | Retrieval controller, gateway/client namespace lifecycle | TC-03–06/10 | implemented; tunnel-only failure and transfer recovery pending |
| #328 → REQ-42 | UC34 integration boundary | Empty client, later cache and scheduler bricks (#311, #437) | TC-06/10 | implemented empty boundary |
| NFR-17 | Synthetic or local fixtures only | `just retrieval-check` (gate); `just retrieval-contract` (local Docker, outside the gate) | TC-01–12 component level | `retrieval-check` automated in the gate |

Sequence: [SEQ-start-retrieval](diagrams/nordvpn-retrieval/02-sequence-start-retrieval.md).
Deployment: [local](diagrams/nordvpn-retrieval/08-deployment-local.md). No class, state or
activity diagram is needed for this infrastructure slice.
