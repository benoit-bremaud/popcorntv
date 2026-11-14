# Test cases — signed local gate

These proposed cases derive from #329 and REQ-30–33 before implementation; none is reported as executed.

## Cases

Use real temporary Git repositories and ephemeral SSH keys, replacing GitHub transport at
the external boundary. Do not mock signature verification or the gate's own predicates.

| ID | Technique | Requirement | Scenario | Expected result | Cheapest useful level |
|---|---|---|---|---|---|
| TC-01 | Happy path | REQ-30–32 | Clean origin-published head, all checks pass, trusted key | Valid note published before success; exact head merges | Script integration |
| TC-02 | Equivalence partitions | REQ-31 | Missing, malformed, wrong-namespace or foreign-key signature | Refuse merge; wrong signing key cannot publish success | Real-crypto integration |
| TC-03 | Decision table | REQ-31 | Valid signature with wrong repository or SHA; misleading GH_REPO | Refuse mismatched payload; transport remains bound to origin | Script integration |
| TC-04 | Trust boundary | REQ-31 | PR substitutes allowed signers; main excludes signing key | Trust only fetched main; refuse signature | Git/crypto integration |
| TC-05 | State transition | REQ-31 | Dirty checkout, local-only head, head only on other remote, head changes during checks | No success or merge; publish failure when a run has started | Git integration |
| TC-06 | Sad path | REQ-32 | Required step fails, is skipped, unavailable or interrupted | Nonzero overall; no signed success; retain original failure | Runner integration |
| TC-07 | State transition | REQ-32 | Prior same-SHA success followed by failed rerun | Pending invalidates old success; failure blocks merge | Runner/transport integration |
| TC-08 | Transport failure | REQ-31–32 | Pending, notes, trusted-main fetch or final status publication fails | Unconfirmed pending aborts before checks, without claiming prior success revoked; failure after confirmed pending leaves merge blocked; failed merge reads refuse | Transport integration |
| TC-09 | Boundary values | REQ-31 | Note ref races succeed at retry limit or exceed five attempts | Preserve unrelated notes; bounded retry only for ref races | Git transport integration |
| TC-10 | Concurrency / race | REQ-31–32 | Pause merge after status read, start rerun; second gate on another head; PR head moves | Shared repository lock refuses overlap before publication; SHA-pinned merge rejects moved head | Lock/Git integration |
| TC-11 | Runtime partitions | REQ-30, REQ-33 | Clean shell, wrong Node, embedded standalone pnpm Node | Valid pinned runtime works; incompatible runtime fails explicitly | Toolchain smoke |
| TC-12 | Resource regression | REQ-33 | Full suite with explicit worker bound and real FFmpeg fixtures | Zero skipped tests; unchanged timeouts; durations recorded | Full local suite |
| TC-13 | Hook wiring | REQ-30 | Commit and push hook composition, staged synthetic secret | Correct recipe invoked once; real secret scan rejects fixture | Throwaway repository integration |
| TC-14 | Evidence movement | REQ-31–32 | Report-only commit or moved PR head after successful gate | New head requires new complete gate | Git/merge integration |
| TC-15 | Bootstrap / revocation | REQ-31 | Trust store absent from main, later key revocation | No first attestation before bootstrap; revoked key rejected | Git/crypto integration |

## Acceptance evidence

Each executed case must link its test file and checked SHA. Record measured toolchain/worker
settings and original failed runs separately from later fixes. Two production-build browser
smokes remain API-stubbed checks and must not be presented as real acquisition validation.
Sonar failure is blocking. No deployment or real download is part of this case set.
