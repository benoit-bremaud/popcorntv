# Test cases — empty local discovery services

These cases derive from #327 and the proposed REQ-34–37 contract before implementation; no execution is claimed.

| ID | Technique | Requirement | Scenario | Expected result | Level |
|---|---|---|---|---|---|
| TC-01 | Happy path | REQ-34 | Fresh private directories and pinned images | Both authenticated APIs live; no indexers, movies, lists or download clients | Real-container integration |
| TC-02 | Boundary / permissions | REQ-35 | Foreign owner, symlink, occupied ports or overlapping subnet | Refuse before mutating existing state/network | Initializer integration |
| TC-03 | Restart transition | REQ-34–35 | Stop/start each service with its own persistent config | Credentials/state persist, permissions stay private, liveness returns | Real-container integration |
| TC-04 | Auth / egress | REQ-35, REQ-37 | First-start auth failure, missing/wrong credentials; external TCP/DNS | No published port before auth proof; failure leaves ports unpublished; protected API access/egress denied, no secret logs | Real-container integration |
| TC-05 | Resource limits | REQ-34 | Inspect identity/capabilities, memory/CPU/PIDs, tmpfs and rotation | Actual constraints match configuration; no root or privileged fallback | Real-container inspection |
| TC-06 | Empty-state invariant | REQ-36–37 | Fresh boot, bootstrap rerun/restart, then deliberate owner config edit | Initially RSS zero and no lists/search/indexers/clients; edited state is refused without resetting it | Authenticated config integration |
| TC-07 | Sad path | REQ-34–35 | Service outage, corrupt config or unwritable state | Sanitized failure, no destructive reset, other service retained | Controlled disposable state |
| TC-08 | Uncertain write | REQ-36 | Configuration accepted but response lost | Read exact current config before retry; no blind duplicate setup | HTTP-boundary integration |
| TC-09 | Source isolation | REQ-37 | Separate disposable stack with two local Torznab fixtures, one unavailable | Healthy synthetic results remain usable; persistent empty stack unchanged, no shared network/config/keys or external query | Approved fixture-only wiring |
| TC-10 | Cleanup boundary | REQ-34–35 | Failed fixture run and existing operator install | Remove only positively identified owned fixture resources | Initializer/cleanup integration |

TC-09 proves only the configured service boundary, not #310's scheduler/finality/backoff.
Resource use and image scan reports must identify exact versions/digests. Tests must preserve
original failures and use the signed local gate before PR merge; no hosted checks are added.
