# Test cases — adaptive wishlist requests

Cases for #309 and UC32, derived from the accepted request contract; execution evidence is recorded separately.

## Sources and scope

Contract: [durable requests](../../specs/adaptive-wishlist-requests.md), REQ-10/12/22/23/25/29.
Risks below are qualitative descriptions, not invented test-plan risk IDs. Use real SQLite
and route injection; replace only metadata/network/time/ID boundaries. Existing auth/CSRF
coverage remains relevant; assertions must verify no private or shared rows were written.

## Cases

| ID | Technique | Source | Risk | Input / steps | Expected result | Level | Test |
|---|---|---|---|---|---|---|---|
| TC-01 | Happy path | #309, REQ-10 | Lost demand | Add an owned movie wish | Wish, one interest and shared demand commit together | API + DB integration | Implemented — see mapping; final gate pending |
| TC-02 | EP / duplicate | #309, REQ-10 | Duplicate retrieval | Retry same PUT; issue concurrent requests from two profiles | One shared demand; one stable private interest per profile | API + DB integration | Implemented — see mapping; final gate pending |
| TC-03 | Sad path | #309, REQ-25 | Unauthorized demand | Anonymous, expired session, other account profile, missing CSRF separately | Existing refusal; no inserted wish/interest/attempt | API integration | Implemented — see mapping; final gate pending |
| TC-04 | Fault injection | #309, REQ-10 | Half-committed wish | Real DB constraint/trigger rejects the interest write | Whole transaction rolls back; request fails | DB + API integration | Implemented — see mapping; final gate pending |
| TC-05 | EP / namespaces | #309, REQ-29 | Wrong title acquired | Movie and TV share TMDB number; two episodes share series | Separate demand/target identities; no episode inferred from series row | DB integration | Implemented — see mapping; final gate pending |
| TC-06 | BVA | #309 target contract | Episode collision | Season -1/0/1; episode 0/1/2; fractional/unsafe values individually | Season zero admitted; invalid values rejected before DB effects | Unit + DB constraints | Implemented — see mapping; final gate pending |
| TC-07 | State transition | #309, REQ-22 | Cross-profile cancellation | Remove one of two interests, repeat DELETE | Other interest and shared attempts unchanged | API + DB integration | Implemented — see mapping; final gate pending |
| TC-08 | State transition | #309, REQ-22 | Revived old notices | Remove last wish then re-add | Fresh interest UUID; no previous subscription notices inherited | DB integration | Implemented — see mapping; final gate pending |
| TC-09 | Recovery | #309, REQ-23 | Lost persisted jobs | Close/reopen actual file DB with wishes/attempts | Same identities and uncertain attempt retained | DB integration | Implemented — see mapping; final gate pending |
| TC-10 | Migration | #309, REQ-10 | Broken upgrade | Prior schema with multiple users, duplicate title interests and local matches | Correct shared backfill; no network writes/readiness; second open unchanged | Migration integration | Implemented — see mapping; final gate pending |
| TC-11 | Decision table | #309, REQ-12/23 | Duplicate remote write | Claim target twice or from two DB connections | One attempt token wins; loser cannot submit | DB integration | Implemented — see mapping; final gate pending |
| TC-12 | State transition | #309, REQ-23 | Blind retry after timeout | Persist claimed attempt, restart before acknowledgement | Uncertain state remains nonclaimable until conclusive reconciliation | DB integration | Implemented — see mapping; final gate pending |
| TC-13 | Sad / stale event | #309 attempt token | Corrupt attempt state | Confirm with wrong/old token or illegal source state | No state or upstream reference changes | DB integration | Implemented — see mapping; final gate pending |
| TC-14 | Decision table | #309, REQ-12 | Unsafe absence assumption | Reconciliation accepted / fenced dispatcher plus authoritative nonacceptance / unavailable / inconclusive | Bind accepted reference / retire attempt then permit guarded fresh claim / keep blocked / keep blocked | Repository contract | Implemented — see mapping; final gate pending |
| TC-15 | Race | #309, REQ-22 | Abandoned submission | Last interest removed before claim vs after claim | Before: cannot claim; after: settle existing attempt without recreating interest | DB integration | Implemented — see mapping; final gate pending |
| TC-16 | EP / local match | #309, REQ-12 | Redundant download | Local movie match or series container exists | Require playable-target resolution; series row never means all episodes available | Repository contract; actual resolver #310 | Partial — see mapping and #310/#311 |
| TC-17 | Privacy / logs | #309, REQ-25 | Secret leakage | Failure plus controlled opaque IDs and sentinel sensitive values | Categorical event, no raw secret/title/profile/provider response | API/component | Implemented — see mapping; final gate pending |
| TC-18 | Deletion | #309, REQ-22 | Shared-work deletion | Delete profile/account with shared demand | Its interests cascade; other interests/shared attempts remain | DB integration | Implemented — see mapping; final gate pending |
| TC-19 | Concurrent sad path | #309, REQ-23 | Late duplicate POST | Pause worker A after claim; B observes empty lookup then A resumes | B cannot release/reclaim without dispatcher fencing and provider finality; at most one dispatch | Worker contract integration in #310; state guard in #309 | Partial — see mapping and #310/#311 |
| TC-20 | EP / unknown evidence | #309 local resolution | Redundant acquisition | Missing/stale/error local probe; TV inventory unknown separately | Unresolved blocks claim; only fresh needs-preparation evidence permits it | Repository contract | Implemented — see mapping; final gate pending |
| TC-21 | State transitions | #309 attempt table | Permanent block or unsafe replacement | Exercise each listed transition plus wrong token, retired mutation and conflicting reference | Only guarded transitions commit; accepted retirement requires #311 proof, otherwise blocked | DB integration | Implemented — see mapping; final gate pending |

## Claim decision table

| Condition / action | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Eligible private demand remains | yes | no | yes | yes |
| Current unresolved/accepted attempt | no | – | yes | no |
| Fresh trusted local resolution | needs_preparation | – | – | already_playable or unresolved |
| Commit a new attempt token | yes | no | no | no |

Actual playability and provider absence proofs are adapter contracts for #310/#311, not
assumed by a repository test. Network timeout cannot prove a request did not happen. An empty
lookup cannot fence a worker paused before POST or establish finality of an in-flight write.

## Open questions and UAT

No parental defaults are chosen by #309. The account model cannot distinguish children yet;
the first live milestone is restricted operationally to selected adult test accounts until #316.
Actual provider reconciliation must be verified before any #310 real submission is enabled.

UAT pending on a recorded local/staging build: add a movie from an owned profile, reopen the
application, repeat the add, then remove one of two interested profiles. Verify privacy and
persistence. No acquisition, readiness, playback or child-policy acceptance is claimed here.

## Implementation mapping

TC-01–04 and TC-17 map to `apps/server/src/discover/routes.test.ts`: concurrent PUTs,
real session/CSRF/profile enforcement and failed persistence with redacted SQL parameters.
TC-02/05–15/18/20/21 map to `preparation-request-repository.test.ts` in the same folder:
real SQLite identity, deletion, migration, arbitration, restart and guarded transitions.
The exact test names describe the asserted outcome. No network or domain collaborator is
mocked in those persistence tests. The retirement regression also requires fresh resolution
and verifies transactional rollback when that invalidation fails.

TC-16 is partial: unknown/stale local evidence blocks claims, but actual playable-file and
episode-inventory resolution belongs to #310/#311. TC-19 is partial: the repository refuses
incomplete retirement assertions and blocks a second token; a real paused dispatcher plus
provider lookup is still a #310 contract integration case. TC-14 tests internal trusted
attestation guards, not real provider finality. Migration and two independent sequential DB
connections are tested; simultaneous multi-process lock contention is not claimed.

UAT remains pending; automated checks cannot establish that the owner has accepted a live
acquisition flow. No download, VPN use or configured external-service write is run by #309.
