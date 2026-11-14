# Local review

Historical records retain their original scope and verdict. The latest #329 verification
chronology is in [signed local gate validation](qa/2026-11-14-issue-329-local-gate.md);
its implementation PR carries the final exact-head signed result. Earlier draft-only
statements below apply to their dated #308 research stages, not later completed merges.

## Scope and verdict

- Date: 2026-11-13.
- Branch: `test/308-adaptive-wishlist-feasibility`; base `origin/main` at `82f3fee`.
- Initial whole-diff independent adversarial review: `aa97e73`; fixes inspected in the working tree
  before the publication commit. The publication commit adds this record and the reviewed fixes.
- Round 1: Must 3, Should 2, push closed. Verification found one additional Must at uncertain creation.
- Final independent verification: Must 0, Should 0 remaining in reviewed corrections.
- **Push gate: open — draft-only.** No merge, deployment, release or issue-closure approval.

## Findings and corrections

1. VPN removal timeout or OS errors interrupted later cleanup and allowed automatic workspace
   deletion. Every removal is now attempted; uncertain removal retains private files; primary and
   cleanup errors are preserved together.
2. Recovery accepted host egress. The recovered address is parsed and compared against the host.
3. The specification contradicted the combined browser/backend evidence. PARTIAL now means bounded
   evidence with outstanding acceptance cases, not absence of the combined fixture proof.
4. Backend shutdown masked primary failures. The tested `stopBackend` helper aggregates failures
   and preserves the incomplete-cleanup marker while retaining the workspace.
5. Partial redaction of arbitrary VPN log text was insufficient. Only categorical diagnostics remain.
6. Verification reproduced daemon-side creation followed by CLI timeout, with no recorded cleanup
   target. Both names are now tracked before create. Any nonzero removal conservatively retains
   the workspace, including a possibly absent container; this favors safe retention over deletion.

The final reviewer independently ran the ten Python test methods and the backend-shutdown Node
regression, and repeated the uncertain-creation probe. No live credentials or containers were used
by the reviewer. Earlier whole-diff review inspected topology, browser evidence, tests and reports.

## Local validation

| Check | Result and limits |
|---|---|
| Application typecheck, lint, formatting, coverage, build | Passed locally on Node 22.23.4; pnpm 10.30.3 emits its embedded Node 20 engine warning while project scripts use pinned Node 22. |
| Application tests | Coverage command passed again; earlier detailed run: 1,356 passed, seven existing skipped. The skips remain explicitly unresolved for merge/release. |
| Experiment quick suite | 39 Node tests passed, zero skipped, including the added shutdown helper regression. Docker Compose renders topology only. |
| VPN boundary coverage | Ten methods with parameterized success/failure cases; 211 statements and 62 branches, 100%, no exclusions. Python >=3.11. Ruff target py311 lint and formatting passed. |
| Extended real experiment evidence | Earlier frozen run on `3433352`: 31 passed, zero skipped. Not rerun after cleanup-only corrections; see the combined report for exact scope and measured values. |
| SonarQube local | Quality gate PASSED; analysis identifies `aa97e73` while reviewing the current working tree. Config covers apps/packages, not the experiment scripts. This is not an attestation of a later commit. |
| Secret scan | Gitleaks 8.30.1 full existing history: 246 commits, no leaks; publication diff is scanned separately before commit. |
| Whitespace | `git diff --check` passed. |

No hosted CI or hosted reviewer was requested. This repository has not yet adopted the `just check` /
`just gate` attestation mechanism; existing application commands were used. No signed gate note,
full security-tool baseline, current staging smoke or Pi verification is claimed. Historic image
scans and isolated live trials retain their dated scope; no VPN replay was performed for these fixes.

## Continuation

Keep #308 open. The [handoff](qa/2026-11-13-issue-308-handoff.md) lists the current final adoption/range contract work and deferred target validation.
The follow-up report below supersedes the earlier missing slow/restart/rename evidence. Wishlist activation and general progressive playback remain unimplemented.


## Recovery and generation follow-up — 2026-11-13

Code commit `e7174ab` adds slow-transfer fallback, controlled partial restart and immutable-inode
rename experiments. Independent adversarial review plus correction verification: Must 0 / Should 0.
The reviewer verified cleanup-marker propagation across open validation, negative proof assertions
and concurrent late mutation/decoder errors. No Docker/network/secret access by the reviewer.

- Consolidated opt-in experiment run: 55 passed, zero failed/skipped, 406 seconds. Its generation
  module preceded the final concurrent-error merge; latest focused replay covers that correction:
  six passed, 100% lines/functions and 97.73% branches. No coverage exclusions.
- Latest five-file quick suite: 46 passed, zero failed/skipped.
- Current lint and repository formatting passed; `git diff --check` passed.
- Gitleaks 8.30.1 existing full history: 248 commits, no leaks. New documentation/staged changes
  are scanned separately before publication. No environment or credentials are staged.
- Application typecheck, coverage, build and local Sonar remain the preceding baseline evidence;
  no apps/packages source or application tests changed in this follow-up. The experiments exercised
  the existing built player. Seven existing application test skips remain unresolved for release.

The [measured report](qa/2026-11-13-issue-308-recovery.md) and JSON distinguish point resource
samples from peaks, graceful restart from crash, and controlled generation identity from arr import.
Documentation consistency review found no blocking discrepancy; the final adoption/unknown-file
contract still needs its research conclusion. **Push gate: open — draft-only.** No merge or release
attestation, issue closure, service installation or deployment is authorized by this record.


## Proposed backend decision — 2026-11-13

ADR-0034 and the [conclusion](qa/2026-11-13-issue-308-conclusion.md) are proposed, not accepted.
Independent final review: Must 0 / Should 0; **Push gate: open — draft-only**. The reviewer verified
source/JSON hashes, measurements, matrix arithmetic/sensitivity, oracle boundaries and the
acceptance disposition, without Docker/network/credential access. Owner weights and contract
validation remain pending; no issue closure, merge, product activation or deployment approval.

The bounded piece reader now accepts authenticated piece metadata, hashes an entire read and
feeds that same buffer to standalone FFmpeg without reference-file bytes. The real prefix poll
and browser adapter still use the fixture oracle. Admission rejects unsupported/malformed metadata;
the first proposal restricts progressive playback to validated single-file v1 and known tracks.
The timing origin was corrected to precede the peer request after metadata admission.

- Real standalone backend replay: 15 passed, zero failed/skipped; 96 pieces and all 1,572,516 bytes
  hash-fed; first frame 19,343 ms, incomplete, completion 29,236 ms.
- Latest real combined browser nominal regression: one passed, zero failed/skipped, after the new
  metadata admission. This still uses the reference-based browser adapter, not the new hash reader.
- Latest fast five-file experiment suite: 48 passed, zero failed/skipped. Current lint/format passed.
- Gitleaks full history: 249 commits, no leaks; new staged diff scanned separately before commit.
- Apps/packages sources are unchanged, so preceding typecheck/build/coverage/Sonar baseline evidence
  is reused. Existing seven application skips and missing full merge attestation remain explicit.

Local preview was opened in Chrome at https://localhost:8443; the existing staging service answers
HTTP 200 and displays sign-in. It was not rebuilt or redeployed by this preview action and does not
show production progressive recovery. No credentials were read or entered to open the preview.


## Refreshed application checks — 2026-11-13

Checked clean code HEAD `08156c1`. The [final local report](qa/2026-11-13-issue-308-final-local-ci.md)
records **1,363 application tests passed, zero skipped**, with `FFMPEG_IT=1`; all seven formerly
unexecuted opt-in cases now pass. Server line coverage is 98.63%, web 98.96%, shared 100%.
Typecheck/build passed, two Chromium smoke journeys passed on the production web build with a
stubbed network API, and the local Sonar quality gate passed with fresh coverage. Full-history
Gitleaks: 250 commits, no leaks. VPN boundary coverage remains 100% (211 statements/62 branches).
The experiment exports have 18/18 JSDoc presence; no repository-wide documentation percentage claimed.

This supersedes the earlier unexecuted-seven-test concern for this checked head. It does not
supersede ADR proposed status, unknown-file browser limits, absent merge attestation or deployment
validation. PR #324 remains draft, and #308 stays open pending owner decision and final gate.


## Owner acceptance and source diversity — 2026-11-13

The owner accepted A and ADR-0034's proposed weights/contract after the refreshed checks, explicitly
requiring future download-source diversity. Research decision: bounded construction GO; production
activation is not claimed. This section supersedes pending-owner-decision statements in earlier
records; their code/test measurements remain unchanged.

REQ-28/#310 covers multiple indexers through Prowlarr and the existing chosen discovery owner.
REQ-29 keeps identities independent of client names; #325 tracks a later second retrieval adapter.
Indexer diversity does not guarantee upstream independence, and native-reader fallback is distinct
from adding another acquisition protocol. No blind resubmission after an uncertain job or mixing
of content generations is accepted. No new runtime code or service installation is part of this
acceptance update. Final publication/merge checks remain necessary; missing attestation still blocks
an ask-free merge in this repository.


Fresh independent documentation review and correction verification for the accepted decision:
Must 0 / Should 0; **Push gate: open** for publication. The reviewer checked source/client diversity,
new stable REQ/T identifiers, no speculative registry, current test-status wording and unchanged
component drawing. This is not a merge attestation. Final clean-head checks follow this commit.


## Final clean-head publication and merge review — 2026-11-13

Checked clean, pushed HEAD: `d9a14ec4691608fbee0ada27549413368a3d737d` (accepted A and source diversity).
This historical run checked the clean accepted-decision head before the later user-requested
boundary-test audit. Its measurements remain valid for that head; a fresh run follows the added
tests. Do not use this older record as a report-only merge exception for later test changes.

| Check | Actual result |
|---|---|
| Application with `FFMPEG_IT=1` | 1,363 passed, zero skipped: 57 shared, 821 server, 485 web |
| Application line coverage | Shared 100%, server 98.63%, web 98.96%; no new exclusions |
| Full five-file opt-in experiment run | **58 passed, zero failed/skipped**, 418.75 seconds; real private backend, built player, combined normal/cancel/rejected-resume, slow/partial restart, hash reader and generation cases |
| Experiment coverage | 96.98% lines / 93.91% branches / 92.92% functions over four instrumented modules; generation 100% lines/functions / 97.73% branches; no exclusions |
| Typecheck, lint, formatting, production build | Passed |
| Built-web Chromium smoke | Two passed, 4.7 seconds; API network responses stubbed, no full-system claim |
| Local SonarQube | Quality gate PASSED, scanner explicitly identifies the checked `d9a14ec` |
| Offline redacted Gitleaks | 252 commits, no leaks; report-only staged diff checked separately |
| Private experiment cleanup | No remaining containers with the experiment project-name prefix after the suite; browser/app/FD cleanup assertions passed |
| Documentation | Existing scoped 18/18 export JSDoc presence; accepted ADR/REQ/traceability/QA consistency independently reviewed; three current conclusion/decision/handoff documents have no broken local links |

Application and experiment counts describe separate suites; the real cases are included in the
58, not extra tests to add. Python VPN source is unchanged; its separately recorded ten boundary
methods and 100% (211 statements/62 branches) coverage remain applicable. No live VPN replay,
public tracker/indexer, real acquisition request, service installation or Pi deployment occurred.

Independent accepted-decision review and correction verification ended Must 0 / Should 0 and
Push gate open. New requirements T-28/T-29 are planned, not reported as executable functionality.
Source diversity preserves the initial qBittorrent choice, multi-indexer #310 and future #325.

### CI mapping and remaining merge exception

The existing application verification job is represented by the local workspace checks above;
secret scanning uses the local redacted full-history tool. No dependency manifests/lockfiles or
production Dockerfile/build inputs change in this branch. Existing CodeQL, dependency-review and
Scorecard jobs are GitHub-only and were not requested under the owner's local-only policy.
No full additional security-tool migration is claimed. The controlled Compose topology has its
separate structural tests and dated image evidence; this report does not invent a new image scan.

All scoped local checks listed above pass. **The merge gate is not attested:** this repository has
no `scripts/attest.sh`/signed gate note and no hosted check statuses were present at the last query.
The PR review/comment lists were empty; recheck them immediately before requesting/performing merge.
Per `pr-review-procedure`, request explicit owner permission for `MERGE_GATE_WAIVER` only after
this concrete review result. Do not infer that exception from acceptance of option A. Until then,
keep #308 open and do not merge or deploy. The only proposed waiver concerns absent mechanical
attestation/hosted statuses, not a failed test, unresolved review, or a production readiness claim.


## Happy/sad/edge audit follow-up — 2026-11-13

The owner requested explicit happy, sad and edge-path assurance. The
[case table](qa/cases/adaptive-wishlist.md) maps TC-01–16. Two missing positive boundary cases were
added to the existing backend test file: exact min/max manifest admission and one-byte/exact-multiple
terminal reads, including the maximum piece. Unsafe integer rejection and no-cache-read-on-invalid
input assertions were strengthened. No production source or protocol behavior changed.

Four targeted reader tests pass. In temporary source copies, changing max `<=` to `<` fails both
new tests, and returning an empty exact final piece fails the reader test. Removing integer checks is also detected by fractional inputs that preserve the correct hash count.
All four detected seeded defects show assertion relevance, not a whole-module mutation score. Final
clean-head checks will be refreshed after this test/documentation commit.


## Final happy/sad/boundary replay — 2026-11-13

Checked clean, pushed source/test/design HEAD: `026c8911be5ab8c604f29a16067679365508a0cc`.
The user-requested audit added two boundary tests and strengthened fractional/read-side-effect
assertions; no production source changed. Independent review/correction verification ended
Must 0 / Should 0 / Nice 0. The [case table](qa/cases/adaptive-wishlist.md) distinguishes happy,
sad and edge cases and explicitly limits the synchronous concurrent-error-helper evidence.

| Check | Result |
|---|---|
| Full five-file opt-in experiment run | **60 passed, zero failed/skipped**, 418.32 seconds |
| Fast five-file subset | 50 passed, zero failed/skipped; included in the 60, not extra cases |
| Application with real FFmpeg cases enabled | **1,363 passed, zero skipped**, 57 shared / 821 server / 485 web |
| Application line coverage | Shared 100%, server 98.63%, web 98.96%; unchanged exclusions |
| Experiment coverage | 96.98% lines / 93.91% branches / 92.92% functions; generation 100% lines/functions, 97.73% branches |
| New reader audit | Four targeted tests pass; four temporary seeded defects detected; not a whole-module mutation score |
| Typecheck, lint and production build | Passed |
| Production-web Chromium smoke | Two passed, 4.8 seconds; network API responses stubbed |
| Local SonarQube | Quality gate PASSED; scanner explicitly identifies `026c891` |
| Offline redacted full-history Gitleaks | 253 commits, no leaks; final report-only staged diff scanned separately |
| Public experiment documentation | Existing scoped 18/18 JSDoc presence; case table/QA audit independently reviewed |

The first format check correctly refused the generated mutation-report JSON. After all functional
runs finished, Prettier reformatted only that machine-readable report; a parsed-JSON equality
assertion passed, and repository `format:check` then passed. This final publication change contains
only this review record and formatting of that proof report: no source, test, design or measured
value changed after the checked head. Preserve the checked SHA instead of claiming a new signed
attestation. Earlier 58-test and 55-test records remain historical, not the current totals.

The source/test/design tree remained fixed throughout the final run. Node/FFmpeg/private peer and
browser experiments are isolated fixtures, not public acquisition or product acceptance. The only
remaining merge exception is absent mechanical signed attestation/hosted statuses in this repo;
owner permission for `MERGE_GATE_WAIVER` is still required by the merge procedure. No merge or
deployment is performed by publishing this record. Recheck remote reviews and cleanup before merge.


Independent final report verification: Must 0 / Should 0; Push gate open for report publication
and PR readiness. The reviewer checked the logs, JSON semantic equality and current source/test
hashes. The two changed files are reports; this is not claimed to satisfy a mechanical exception
limited literally to one report file, nor to supply missing signed attestation. Final owner
merge-exception permission remains required. PR reviews/threads/Conversation comments were empty
at the final inspection; no reply was needed and no hosted reviewer was requested.


## PR review finding — late completion observer

Automatic Codex review on `0a75504` identified P2 comment `4561346990`: `sampleResources('complete')`
can fail after prefix reaches file size. The poll records the error and resolves; previous consumer
loops then no longer enter their incomplete-prefix guards, allowing a successful result.
The claim was verified in code and reproduced in a temporary source copy with a real private fixture:
the new regression reports missing expected rejection before the fix. No repository source was mutated
by the red replay. This review does not waive the finding or substitute a byte-complete result for it.

Resolution options (0–5 engineering scores, weights total 100): A checks the captured error after
poll/FD settlement, keeping prior failures first; B makes the poll reject with an immediate observer
and revises cleanup/error classification; C treats missing completion metrics as nonfatal.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Failure contract: incomplete evidence cannot report success — required | 40 | 5 — explicit final error check | 5 — rejection can propagate | 0 — weakens the required evidence; excluded |
| Cleanup and diagnostics | 25 | 4 — existing closes/primary error retained; poll phase logged | 5 — can aggregate every cause after extra classification | 4 — closes retained but failed evidence tolerated |
| Change/maintenance cost | 20 | 5 — one final guard, no new abstraction | 2 — rejection lifecycle and resource classification change | 4 — small reporting change |
| Regression observability | 10 | 5 — actual private-driver rejection assertion | 4 — test plus immediate-rejection behavior | 3 — changes expected success contract |
| Compatibility | 5 | 5 — healthy runs unchanged | 3 — poll promise contract changes | 2 — success semantics change |
| Total /500 | 100 | **475** | **420** | **220 — excluded** |

A wins by 55 points. Sensitivity: failure weight40→60, others×40/60: A 483.33 / B 446.67 / C 146.67;
failure weight40→20, others×80/60: A 466.67 / B 393.33 / C 293.33 (C remains excluded). The bounded bug-fix
uses A under the already authorized review/fix task; this does not change the owner's backend A.

The implementation checks `observationFailure` after `closeTransfer` has awaited the poll and closed
readers, before any successful result. Existing transfer/cleanup errors keep priority and unsafe
cleanup markers. A new opt-in `failCompletionSample` fault reaches only measured nonprogressive
scenarios and is validated before resource allocation. TC-17 requires real failure propagation and
categorical completion-resources/complete=true evidence. Additional phase diagnostics are static
enums, not raw IO. Fresh checks on the fix commit supersede the earlier 60-test head for merge.


Focused late-observer verification: the pre-fix temporary-copy replay fails with missing expected
rejection. The corrected actual private-driver case passes (one test, zero failures/skips,
52.58 seconds), including completion-resources/complete=true diagnostic assertions. An independent
code review found no Must/Should; its diagnostic Nice was applied by setting phases before cache
open and deadline checks. The final accepted source/tests require a fresh consolidated pass including
`RUN_BACKEND_FAILURE_SPIKE=1`; prior 60-case results remain historical for their checked head.
The owner also requires progress reporting after each merged PR before the next brick; this is
recorded in CLAUDE.md and the handoff. No percentage is claimed as updated before an actual merge.

## Final validation after the late-observer fix

Checked clean source/test/design head: `2b6d99ec58b18e6429957d3c880ab23ba1142e64`.
The consolidated run including `RUN_BACKEND_FAILURE_SPIKE=1` passed all 61 tests, with zero
failures, cancellations or skips (490.21 seconds). Experiment coverage is 97.56% lines,
94.32% branches and 92.92% functions. Generation coverage remains 100% lines/functions
and 97.73% branches. These measured results supersede the earlier 60-case publication.

All 1,363 application tests passed with FFmpeg integration enabled and zero skips.
Application line coverage is shared 100%, server 98.63% and web 98.96%. Typecheck,
lint including catch-log auditing, formatting and production build passed. Both Chromium
smoke journeys passed against the built web bundle with stubbed API responses. Local
SonarQube quality gate passed; redacted Gitleaks scanned 255 commits without leaks.
No owned recovery-spike containers remained after completion.

Independent code review and fix verification found Must 0 / Should 0. The P2 finding
received an inline explanation of the fix, decision and failing-before/passing-after
regression. The final remote inspection found one answered, resolved thread and no
additional review-body findings. No further conversation resolution is performed here.
This publication changes only this review report after the checked source head; it does
not claim signed attestation. Push gate: open for this report-only publication, subject
to independent report verification. Merge still requires the explicit owner waiver for
the absent signed gate/hosted statuses; no local check failure is waived.

## Issue #309 — durable wishlist requests

Checked clean source/test/design head: `57941127c78be30c39fe8c1e032830757b292bda`.
The owner validated the concrete request contract before implementation. The ordered
first-real-test milestone is recorded in #306; child-account implementation is deferred.

All local gate commands finished with exit 0 on that head:

| Check | Result and exact scope |
|---|---|
| Full application coverage with `FFMPEG_IT=1` | **1,401 passed, zero skipped**: shared57/server859/web485; 83 test files |
| New request repository coverage | **100% lines/functions/branches**: 72/72 lines, 14/14 functions, 93/93 branches in LCOV; no exclusions |
| Application line coverage | Shared100%, server98.64%, web98.96%; server branches93.32%, web branches93.87% |
| Typecheck, lint/log audit, formatting, production build | Passed |
| Chromium on production web bundle | Two catalog/detail/back/reload smoke journeys passed in5.3s; API responses stubbed |
| Local SonarQube | Gate PASSED on5794112; initial two new style findings corrected before this run |
| Semgrep | Digest-pinned1.181.0; 74rules/219targets; zero remaining findings after seven individually justified existing false positives |
| Redacted full-history Gitleaks | 261commits scanned, no leaks |

Node22.23.4 and pnpm10.30.3 were used; the pnpm executable's embedded Node20 warning does not
describe the project's child Node22 runtime. Initial sandbox EPERM results are failed historical
attempts, superseded by the successful unsandboxed FFmpeg/local-listener run. No lint or Sonar
rule was disabled for the new behavior. The scoped Semgrep annotation decisions are in
`qa/2026-11-13-issue-309-implementation.md`; registry rules are fetched, not content-pinned.
Docker security workflow path filters do not match this diff. Hosted-only CodeQL/dependency
review/Scorecard are not executed under the owner's local-only policy. No signed gate mechanism
exists; do not claim an attested head or waive an actual failing local check.

Independent design review: Must2/Should2 corrected and verified; independent runtime review:
Must1/Should1 corrected and verified, then the tiny Sonar fixes reviewed with Must0/Should0.
The important runtime fix atomically invalidates local evidence on attempt retirement; the
regression proves renewed claims wait for fresh resolution and failed invalidation rolls back.
Every new exported type/class/table and public repository operation has a contract docstring;
this presence/quality audit is scoped to the new API, not whole-project documentation coverage.
Happy/sad/edge mapping is in `qa/cases/adaptive-wishlist-requests.md` and `docs/testing/qa-matrix.md`.
Earlier pending markers in the source snapshot are superseded by these measured final results.

This publication changes only this review report after the checked head. Source, tests and
design remain fixed. Push gate: open, subject to independent final report verification.

### Authorized read-only service inventory

The owner requested an installation audit and chose a film for the first real trial.
Local Docker and `benoit@bb-homelab` Docker inventories show no Prowlarr/Sonarr/Radarr,
qBittorrent/SABnzbd or Gluetun containers, including stopped containers. Systemd service-file
inventories show Tailscale units but no matching recovery/arr/NordVPN units on either host.
No named native recovery executables were found on the local PATH. This is not an exhaustive
disk/package/configuration audit and does not prove no dormant installation exists elsewhere.
PopcornTV is healthy locally on staging8c1ea1f and on the Pi at11b2edd; these live versions are
older than this branch. Local homelab compose-file inventory contains no arr/recovery stack.
No credentials, application databases, container environments or service configuration contents
were read. No service was restarted, configured or deployed; no download was triggered.
Tailscale presence does not establish a download VPN path. #310 must plan and validate a
dedicated retrieval/VPN stack before claiming the first real film flow is available.

## Issue #331 — legacy Sonar maintainability

Checked clean source/test/design head: `05ba727ba73637c95f624e60e841064a5d1a86fa`.
The narrow refactor replaces five final-element lookups with `at`, uses code-point lookup
only after the existing single-ASCII-letter guard, and returns the synchronous library array
without an unnecessary promise wrapper. Installed Fastify source confirms automatic sending
of synchronous return values and exception handling. No parser semantics, API shape, rule
suppression or regex-complexity fix is included; the latter remains #330.

- Full application coverage with real `FFMPEG_IT=1`: **1,408 tests passed, zero skipped**,
  shared57/server866/web485 across83files. The98-test parser/library targeted suite also passed
  before the final source commit; these are overlapping totals, not additive counts.
- Parser LCOV: **79/79 lines and15/15 functions**,89/92 branches (96.74%). No exclusions or
  number-only tests added. New cases cover part letters a/D, rejected e and empty/separator-only
  paths; existing API cases cover empty/populated library lists and existing series fallbacks.
- Application lines: shared100%, server98.64%, web98.89%; server branches93.57%, web93.78%.
  The unchanged web suite's measured coverage is reported as observed, not rounded to100%.
- Typecheck, lint/log auditing, formatting and production build passed. Both Chromium smoke
  journeys on the built web bundle passed in5.2s with stubbed API responses.
- Local SonarQube gate PASSED on05ba727. A subsequent read-only issue inventory returned only
  S8786, the existing parser-complexity issue tracked in #330: all seven #331 findings resolved.
  Gate conditions: new coverage95.4%≥80%, new duplication0%≤3%, new violations0.
- Semgrep:74rules/219targets, zero findings. Redacted Gitleaks:257commits, no leaks. The engine,
  named rules and exclusion policy match the preceding #309 local security pass.
- Independent adversarial review: Must0/Should0. It verified array-edge equivalence, the ASCII
  invariant, synchronous Fastify behavior and meaningful test boundaries. `git diff --check`
  passes. No network service, credential, migration, dependency or deployment was changed.

The source snapshot also publishes the prepared #326 post-merge journal. The QA matrix now
contains E331-01–04. Hosted-only checks and absent signed attestation retain the explicitly
documented local-only merge exception; no actual failing local check is waived. Docker security
workflow path filters do not match this diff. This final publication changes only this review
report after the checked head. Push gate: open subject to independent report verification.

Any pending-final-gate markers in the frozen #330 planning/evidence documents are superseded
by the measured #330 results below; they are not unresolved test executions.

## Issue #330 — bounded parser suffix cleanup

Checked clean source/test/evidence head: `9ea9164b1e5920882849ff4e6584abeecf9a6db9`.
The artifact in `qa/2026-11-13-issue-330-benchmark.json` was measured on core0c46123;
parser/harness hashes match the final head. Its JSON formatting preserves all measured values.
Adversarial code/artifact review and independent test-pertinence review ended Must0/Should0.
The latter resolved two Should findings and removed a redundant sweep before final execution.

| Check | Final result and scope |
|---|---|
| Application coverage | **1,446 passed, zero skipped**, shared57/server904/web485 across83files; real FFmpeg enabled |
| Explicit final test command | `FFMPEG_IT=1 pnpm coverage --maxWorkers=4`, unchanged globs/assertions/timeouts |
| Deterministic frozen-parser equivalence | **22,236 complete-object comparisons passed** again with --verify-only on9ea9164; not additional Vitest tests |
| Scoped parser LCOV | **82/82 lines,15/15 functions**,92/95 branches (96.84%); no exclusions |
| Whole-application lines | Shared100%, server98.64%, web98.89%; server branches93.58%, web93.87% |
| Typecheck, lint/log audit, formatting, production build | Passed |
| Chromium production-bundle smoke | Two journeys passed in10.1s; API responses stubbed |
| Local SonarQube | Gate PASSED on9ea9164; read-only unresolved-issue inventory returned **total0**; S8786 resolved |
| Semgrep | Pinned1.181.0,74rules/220targets, zero findings |
| Redacted full-history Gitleaks | 260commits, no leaks; staged report scanned separately before publication |

The first full default-worker run failed an existing keyframe fixture's10s beforeAll hook,
leaving four FFmpeg tests unexecuted. This was not counted as green or silently discarded.
Those four tests passed in isolation (7.74s total), then the entire suite passed with the
explicit four-worker budget. No test was disabled, no timeout increased and no retry flag
used. Resource contention is a plausible explanation, not a proved universal diagnosis.
Formalize a measured bounded/resource-aware gate runner in #329 before #315 A; the default
unconstrained command is not claimed to have passed. The failed log remains locally in
`/tmp/popcorntv-local-ci/330-coverage-parallel.log`; successful bounded run in330-coverage.log.

Measured nonmatching16,384-hyphen stress fixture: baseline328.2824ms/current0.1363ms median,
with5samples and observable checksum505212. Matching fixtures do not improve systematically;
no universal speedup, production latency, whole-parser linearity or remote DoS claim is made.
Source reachability, filesystem-bound limits, decision and all rows are in
`qa/2026-11-13-issue-330-parser-complexity.md`. The new suffix pass visits each removable
position once after unchanged normalization. Literal tests cover all25ECMAScript whitespace
characters plus nonmatching Unicode, raw fallback and metadata; there are no domain mocks or
elapsed-time assertions. Parser hot-path logging is unchanged; synthetic benchmark data is safe.

Node22.23.4/pnpm10.30.3 and the existing local toolchain were used. No dependency, service,
deployment, credential or public API changed. This source snapshot publishes the prepared
#332 merge journal and QA E330-01–04. Docker workflow path filters do not match. Hosted-only
checks remain unexecuted under the local-only policy; missing signed attestation stays #329,
not an actual local-check failure waiver. This final publication changes only this review
report after the checked head. Push gate: open subject to independent report verification.
