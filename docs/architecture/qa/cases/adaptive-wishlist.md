# Test cases — adaptive wishlist feasibility

Retrospective risk-based audit of the #308 research tests, with missing boundary cases added on 2026-11-13.

Story #308; future UC32/UC33 runtime flows remain unimplemented. Techniques follow
`test-design-techniques` and `testing-strategy`. Risk descriptions below are qualitative:
this dossier has no mapped `RSK-*` register, so no formal risk identifiers are invented.
EP means equivalence partitioning; BVA means boundary value analysis. Test names identify executable assertions; planned future cases are explicitly separate.

## Open questions

| ID | Question | Blocks |
|---|---|---|
| Q1 | Runtime metadata response/count/buffer budgets must be aligned in #311; the research helper allows 65,536 digests but the command response cap can reject earlier | Production admission, not the bounded helper tests |
| Q2 | Unknown-file browser scheduling and complete required-caption admission still need implementation under ADR-0034 | Product UC33 readiness and playback |
| Q3 | Actual Pi capacity and configured arr import remain deployment/runtime tests | Target acceptance, not the private fixture research outcome |
| Q4 | The full decoder-first/late-mutation-error timing is not orchestrated by the synchronous error-merge unit test | Runtime orchestration fault-injection before activation; no such interleaving coverage is claimed |

## Cases

All file names below are under `scripts/`. The two added boundary tests exercise valid extreme
values, not just failures beyond them. The other cases already exist and are audited here.

| ID | Technique/path | Source | Risk | Input / steps | Expected result | Level | Test |
|---|---|---|---|---|---|---|---|
| TC-01 | EP / happy | ADR-0034 reader contract | Unchecked bytes reach decoder | Read the first and short final piece using correct metadata and state 2 | Exact bytes hash-match and are returned | Unit | `qbittorrent-spike.test.mjs`: piece reader returns exact hash-verified bytes |
| TC-02 | BVA / edge, added | Manifest bounds in ADR-0034/code | Off-by-one rejects supported limits | Piece sizes 1, 2, max−1, max (4 MiB); counts max−1/max (65,535/65,536) | Valid boundaries admitted with exact counts | Unit | `qbittorrent-spike.test.mjs`: piece manifests admit minimum and exact maximum bounds |
| TC-03 | BVA / sad | Manifest bounds in ADR-0034/code | Unsafe allocation or invalid metadata | Zero/fractional/unsafe-integer file size; zero/fractional/max+1 piece size; max+1 hash count | Admission rejects before reader allocation | Unit | `qbittorrent-spike.test.mjs`: piece manifests reject unsafe bounds |
| TC-04 | EP / sad | Manifest admission contract | Wrong or mutable metadata | Missing/sparse/malformed hashes, wrong hash identity, later caller array mutation | Invalid input rejected; valid admitted metadata is an immutable copy | Unit | `qbittorrent-spike.test.mjs`: piece manifests reject unsafe bounds, sparse hashes and caller mutation |
| TC-05 | BVA / edge, added | Exact last-piece length contract | Zero-byte last piece or truncation | One-byte file; exact two-piece multiple; one maximum-sized piece | Last read has full expected length; output equals source | Unit | `qbittorrent-spike.test.mjs`: verified piece reads handle one-byte and exact-multiple files |
| TC-06 | Decision rules / sad | Admission/downloaded-state contract | Cache accessed before permission | Unadmitted manifest; indices −1/count/fraction/NaN; states 0/1/3/unknown | Reject and do not call cache read | Unit | `qbittorrent-spike.test.mjs`: piece reader returns exact hash-verified bytes, read counter assertion |
| TC-07 | EP / sad | Exact-buffer integrity contract | Telemetry accepted as integrity | Short read, corrupt content, filesystem read error despite state 2 | No unchecked Buffer returned; error propagates | Unit | `qbittorrent-spike.test.mjs`: piece reader returns exact hash-verified bytes |
| TC-08 | Temporal edge / sad | Exact-buffer delivery in ADR-0034 | Time-of-check/time-of-use substitution | Modify source after a verified Buffer is returned, then read again | Existing Buffer remains unchanged; new corrupt read fails | Unit | `qbittorrent-spike.test.mjs`: verified piece reads handle one-byte and exact-multiple files |
| TC-09 | EP / happy | #308 controlled backend criterion | False progressive claim | Real private torrent and authenticated piece metadata; decode before full bytes exist | Hash-fed bytes decode correctly; independent cache is incomplete at first frame | Integration, opt-in | `qbittorrent-spike.test.mjs`: standalone backend still decodes matching frames |
| TC-10 | Decision rule / slow | #308 slow recovery criterion | Premature playback | Real limited transfer below fixture consumption | Full-file gate precedes first frame; frame/reference match | Integration, opt-in | `qbittorrent-spike.test.mjs`: real backend slow recovery |
| TC-11 | Recovery edge | #308 interrupted recovery criterion | Lost/replaced bytes after restart | Controlled stop/restart before completion, reauthenticate/reopen/revalidate | Prefix retained, coherent decode after resume | Integration, opt-in | `qbittorrent-spike.test.mjs`: real backend interrupted recovery |
| TC-12 | Generation / happy and sad | ADR-0034 generation contract | Reader silently follows replacement | Rename during actual decode, replace old path, try stale/new opens | Original FD decodes reference; stale new open rejects; renamed identity revalidated | Unit + integration, opt-in | `generation-spike.test.mjs`: generation opens; active decoder survives rename |
| TC-13 | Error-composition sad paths | NFR-7 / cleanup contract | Delete files still in use or mask primary failure | Failed close, synchronous combination of decoder/mutation errors, negative rejection assertion, further closes; separate real failed-mutation experiment | Preserve failures and unsafe marker; attempt all closes; retain uncertain workspace | Unit for error merging/close; separate opt-in integration for mutation failure | `generation-spike.test.mjs`: generation mismatch; late mutation failure; failed rename preparation; `qbittorrent-spike.test.mjs`: backend shutdown / consumer cleanup |
| TC-14 | Real player / happy | #308 browser criterion | Backend proof mistaken for browser readiness | French HLS audio, parsed complete known caption and active startup cue | Frame before completion, active French cue and actual normal end | Browser integration, opt-in | `combined-player-spike.test.mjs`: real backend and player start |
| TC-15 | Real player / sad and cancel | #308 cancellation/readiness criterion | False ready or leaked session | Cancel incomplete player; reject backend resume; omit readiness evidence | Session deletion/cleanup; rejected preparation cannot release frame gate | Unit + browser integration, opt-in | `combined-player-spike.test.mjs`: real combined cancellation / rejected resume; `player-spike.test.mjs`: caption gate/failure tests |
| TC-16 | Timeout / edge | Bounded-work contract | Infinite wait or missing data treated as EOF | Deadline reached/passed, absent range, abort, sparse preallocated file | Bounded error/cancel; no hole/false EOF served | Unit | `progressive-playback-spike.test.mjs`: verified waits / cancellation / preallocated file; `qbittorrent-spike.test.mjs`: command budget |
| TC-17 | Late asynchronous sad path | #308 resource evidence / NFR-7 / PR #324 review | Completed coverage masks a failed final measurement | Real private interrupted transfer reaches full prefix; inject completion sampling failure | Experiment rejects after poll/reader settlement; structured phase is completion-resources and complete=true; no successful result | Integration, opt-in | `qbittorrent-spike.test.mjs`: a resource observation failure after full coverage rejects the real backend experiment |


## Reader decision table

Manifest/index valid is one admission condition. An invalid condition rejects before reading;
a physical read is attempted only for the final two columns. Failure never returns unchecked bytes.

| Condition / action | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| Manifest/index valid | no | yes | yes | yes |
| State is downloaded (2) | any | no | yes | yes |
| Exact complete read and digest match | not read | not read | no/error | yes |
| Outcome | reject/no read | reject/no read | reject/error | return exact verified buffer |
| Cases | TC-04/06 | TC-06 | TC-07 | TC-01/05/09 |

## Deferred runtime cases

REQ-28/T-28 multi-indexer outage/deduplication and REQ-29/T-29 secondary-client reconciliation are
planned in #310/#325; no executable behavior is claimed by creating those requirements. Full
preparation-state transitions, unknown-file browser readiness and child authorization belong to
#309–#316. Their accepted lifecycle state diagram must drive the implementation test cases.

## UAT and evidence

Local synthetic experiments are developer evidence, not stakeholder sign-off on a deployed
wishlist-to-watch feature. No product UAT signature is claimed. The existing QA ledger and current
`review-local.md` record actual checked heads/counts. A targeted temporary mutation check validates
that the new exact-maximum and exact-multiple tests detect off-by-one implementation defects;
it does not measure whole-module mutation coverage.


## Targeted mutation evidence — 2026-11-13

Only public source/test files were copied into a disposable private `/tmp` directory; no production
file, repository source, Docker service or credential was changed. Each variant ran the four targeted manifest/reader tests, covering TC-01–08.

| Variant | Observed result | Meaning |
|---|---|---|
| Unmodified reader | Four passed, zero failed | The valid extreme/exact-multiple cases are supported |
| Change maximum admission from `<=` to `<` | Two fail, two pass | The exact maximum is protected against off-by-one refusal |
| Return zero length for an exact final piece | One fails, three pass | The terminal read boundary is protected independently |
| Remove the integer file-size guard | One fails, three pass | Fractional 5.5 is rejected independently of hash count |
| Remove the integer piece-size guard | One fails, three pass | Fractional 3.5 is rejected independently of hash count |

All four seeded defects were detected; no whole-module mutation score is claimed.
The fractional values deliberately retain the valid two-hash count so another guard cannot mask
an absent integer check. [Machine-readable evidence](../2026-11-13-issue-308-edge-mutation.json) records source hashes and outcomes for snapshot `026c891`; later observer-failure changes have separate replay evidence. The returned-buffer
snapshot and no-read-on-rejection assertions also pass in the targeted four-test reader audit.


## Late completion-observer regression

An independent PR review found that a resource-measurement error after full prefix coverage could
be recorded by the poll but not propagated by the main operation. The new TC-17 exercises the
actual driver, not just an error helper. Its pre-fix temporary-copy replay fails with missing
expected rejection, reproducing the false-success defect. The corrected driver checks observation
failure after the poll and reader closes settle, preserving earlier transfer/unsafe-cleanup failures.
The failure log identifies only categorical phase and completion status, not credentials or raw IO.

Run this extra private integration case with `RUN_BACKEND_FAILURE_SPIKE=1`; it is not part of
ordinary application coverage. Its final green result is recorded in the current review ledger.
