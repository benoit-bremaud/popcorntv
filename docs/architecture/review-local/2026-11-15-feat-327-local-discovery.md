# Local review — PopcornTV local discovery

This record distinguishes source-review findings, targeted acceptance and unsuccessful global validation.

- Date: 2026-11-15.
- Branch: `feat/327-local-discovery`; base `origin/main` at `9ef3db5`.
- Latest published functional verification: `e432866` on 2026-11-17. The
  responsibility refactor recorded below has targeted verification and still
  requires publication and an exact-head global gate.
- Dimensions: fresh adversarial source review, design/container verification,
  independent test-quality review, documentation/traceability reconciliation,
  targeted security and correctness checks.
- Source verdict at `cd62451`: Must 0 / Should 1 / Nice 4; the Should corrected in the following
  commit, remaining Nice items filed (#349).
- Publication: PR #351 is open on `e432866`. Its complete gate passed dependency
  checks and the real-container journey, then failed at SonarQube. No successful
  attestation, merge or deployment is claimed.

## Adversarial review

The review rounds used independent local reviews with separate context.

| Round | Source | Result |
|---|---|---|
| Review | d0cfa62 | Must 1: anonymous first listen can expose API key; Should 2: reproducible resize regression and stale traceability; adversarial push gate closed |
| Verification | 02bb954 | Original three findings fixed; new Should: malformed XML escapes categorical CLI handling; no new Must |
| Verification | 16327d2 | XML failure translated safely; actual CLI regression checks no Docker call, no traceback, unchanged bytes; all findings fixed, none regressed; adversarial push gate open |
| Independent review | 3a7381a | Must 1: #327 status contradicted between spec and glossary; Should 9: untested fail-closed paths, expired keys kept serving, failed scan on a rerun left the stack published, unenforced `uv.lock`, wrong deployment note, heavy gate steps on every diff without an owner decision, missing ADR and commands, Semgrep XML finding, lint broken by `data/`; Nice 9; push gate closed |
| Independent verification | d6a833e | Round-one findings fixed or filed (#347–#350); new Must 1: `DISCOVERY_PATHS` missed the Trivy ignore file, the test runner, the mise pins and renames; Should 4: no mechanism behind the #315 replay, path list not fully pinned, `status` not fail-closed on a failed proof, this record stale; Nice 9; push gate closed |
| Independent verification | cd62451 | Round-two findings fixed or filed; Must 0; Should 1: a malformed HTTP answer escaped the `status` stop; Nice 4; push gate open. The Should is corrected in `44f7229`; remaining Nice items are tracked in #349 |
| Corrections | d6a833e..cd62451 | Path list completed and pinned, renames and quoted names handled, `LOCAL_CI_DISCOVERY=1` forced replay recorded as `run (forced)`, evidence `scheduled` until the discovery steps pass, `status` stops the owned services on a failed proof, sensitivity figures corrected |

The review verdict is separate from execution. The owner authorized resuming the
complete pre-merge gate on 2026-11-17; its current result is failure, as recorded below.

## Findings and corrections

- First listen: new configuration enables Forms/RequiredEnabled before process
  startup. Unsafe legacy settings are refused without resetting configuration;
  owned stop is attempted. Account provisioning handles an absent user despite
  matching policy and preserves a foreign administrator.
- Bootstrap leakage: anonymous initialization metadata is checked before account
  writes and during rollback. A leaking backend prevents publication and triggers
  stop fallback. Real-container acceptance observes denial before provisioning
  and after a rejected setup request. Earlier generated operator API keys were
  rotated through the official reset command, verified and old keys rejected.
- Image compatibility/security: complete source builds retain Mono reflection
  loading and a same-source UI, omit the disabled updater and use immutable
  scan/start identities. Required licenses are private BuildKit secrets.
- Regression reproducibility: Bake includes a pinned ImageResizerFixture target
  with two executed/passed TRX counters. The historical manual run passed two
  tests; the newly checked-in target awaits execution at the global milestone.
- Effective ingress: actual loopback bindings, authenticated requests and exact
  network ownership/attachments/addresses are checked. The second subnet is
  allocated before creation against host routes and Docker networks. Effective
  rollback is verified; failure is not hidden by cleanup.
- Test quality: same-image TCP/DNS positive controls bracket denials and advance
  canary counters. Synthetic outage checks both failed-source attempts and a fresh
  healthy response. Source download endpoints return 410 and contain no media.
- Traceability: historical private-only evidence is tied to 6329c95; current
  published/source acceptance and deferred global status are documented separately.
- Failure reporting: malformed XML produces a categorical CLI refusal rather than
  an uncaught parser traceback. The regression verifies original bytes survive.

## Targeted execution evidence

| Check | Recorded result and scope |
|---|---|
| Python component/completeness suite | 93 passed, 91.08% combined statement/branch coverage before the final XML-only correction |
| Final XML correction | One targeted actual CLI subprocess case passed in 0.25s; no claim of a new full 94-case run |
| Real-image journey | One passed in 68.19s: pre-account authentication, rejected setup, private/published startup, limits, restart, isolation and synthetic sources |
| Python static checks | Ruff and strict mypy passed on the changed production/test files |
| Container checks | Pinned Hadolint passed on the changed builds; actual selected images passed HIGH/CRITICAL scans without new suppressions |
| Security fixture fix | Targeted Semgrep: 68 applicable rules, zero findings |
| Commit hooks | Staged gitleaks, formatting and lint passed; a style rejection was corrected and the hook rerun, never bypassed |
| Documentation presence | 53/53 public declarations across the two new production Python modules have docstrings (48 + 5); this presence measure does not substitute for freshness review |

## Historical global execution deferral — 2026-11-15

The last complete L1 run on d0cfa62 failed on fixture response interpolation. That
input was removed and its targeted recheck passed; the entire recipe has not
subsequently been certified green. The owner explicitly requested that global CI
wait until the pre-Pi deployment milestone. No step is waived or retroactively green.

At that checkpoint, pending checks were: complete L1 rerun, build/regression targets, SonarQube including the added
Python coverage import, browser E2E, complete image/config/source/SBOM checks and
signed exact-head verification. Where `scripts/attest.sh` exists, merge still uses
`mise x -- just merge N` after those steps pass. Existing product staging/Pi QA is
not superseded by infrastructure fixtures. ARM64 and Pi integration remain separate.

## Remaining findings

### Must

_None in the reviewed source; global execution remains pending._

### Should

_None in the reviewed corrections._

### Nice

Filed on #349, not fixed in this pull request.

### Intentional boundaries

The local fixed proxy does not change bb-homelab's central Caddy or existing
staging. No real provider, downloader, media file, acquisition scheduler,
progressive playback or ready notification is installed by this brick.

## Resumed pre-merge validation — 2026-11-17

- Checked head: `44f7229f79fd9c53be5ad4cdb959156ee6ee6605`.
- Retained evidence: `.git/local-ci-runs/20261117T164206Z-44f7229f79fd9c53be5ad4cdb959156ee6ee6605-1008426/`.
- Full gate exit: 1; `result=failure`. Eighteen recorded steps, one nonzero step:
  OSV reports GHSA-fc5q-39xc-vjpf on `picomatch` 4.0.7 (High, CVSS 8.7).
- Passed: locked install, typecheck, lint, format, 45 infrastructure tests,
  Ruff, mypy, 111 Python tests (93.42% combined coverage), Lefthook,
  ShellCheck, Gitleaks, Semgrep, and application suites (57 shared, 905 server,
  485 web tests; no skipped tests).
- Discovery rebuild/journey, SonarQube, browser and subsequent container/SBOM
  steps were not reached. No attestation verification was attempted.
- Failure-status publication also reported `attest: gh api failed (exit 1)`;
  no successful remote status publication is inferred from this attempt.
- Independent verification of the malformed-response correction: four targeted
  cases passed, covering both faults with successful and failed owned-service stop.
- Gate: **RED**. The dependency finding requires resolution before a new complete run.

## Dependency correction and resumed review — 2026-11-17

The owner authorized integrating a conservative `picomatch@4.0.7` patch and the
conditional classification of GHSA-fc5q-39xc-vjpf, expiring exclusively on
2026-12-01. The patch rejects every repeated extglob. Independent assessment of
two upstream candidates found semantic regressions or incomplete mitigation;
neither was adopted. The conservative prototype passed 48 refusal cases,
550 preserved short matching comparisons and 1,447 application tests with actual
FFmpeg; lint and production build passed. This prototype experiment did not
constitute an installation or signed gate.

The integration registers the patch in pnpm and its lockfile, supplies it to the
Docker build, verifies every inventoried installed instance and preserves the
raw OSV report for both lockfiles. No global ignore is introduced. Exact identity,
patch/parser fingerprints, matcher regressions and exclusive expiry gate the
single classification. Any other finding remains blocking. The local gate runs
the new controller's tests with line/branch/function coverage floors and imports
its LCOV into SonarQube.

Independent source/security review and test-quality review found and verified:

- A stale scanner report could survive a failed rerun: every invocation now gets
  a new directory, and launch errors/signals are explicitly refused.
- The executable scanner fixture now requires both lockfiles, all vulnerabilities,
  JSON output and an explicitly empty config, preventing reduced scan scope.
- CLI tests use a fixed date while production uses the actual date; wrong
  ecosystems and source types have explicit rejection cases.

Final source and test-review verdict: Must 0 / Should 0 / Nice 0; review gate open.
Eleven controller tests passed, with 96.50% line, 92% branch and 100% function
coverage in the independent targeted run. Trivy source precheck passed without a
new suppression. The complete resumed L1 run passed with exit 0: 45 infrastructure, 111 Python,
11 dependency-controller and 1,447 application tests, with actual FFmpeg and no
skips. Types, lint, format, secrets and Semgrep passed; the real dependency check
classified one locally corrected finding. Local evidence is retained in
`/tmp/popcorntv-327-integration-check.log` and
`/tmp/popcorntv-dependencies-EXFTBD/`. Exact-head L2 execution remains pending;
pre-push success does not make the global gate green.

## Preflight cleanup correction — 2026-11-17

The project refresh audit found that XML/private-file/ingress validation and
requested-port checks could refuse a rerun before entering cleanup, leaving a
previously published installation running. `start` now places all preflight
checks under one existing owned-service stop boundary. The authentication
validator remains side-effect-free. Cleanup preserves the original exception;
failed or foreign ownership never permits a mutation and remains unconfirmed.

Fourteen added integration cases cover six faults with successful/failed stop,
foreign ownership and a real occupied port. Container observations retain the
subnet from actual fixture publication rather than rereading subsequently
damaged configuration. The CLI regression records its complete Docker history
and requires only context inspection when the local daemon cannot be confirmed.
The original XML refusal, no traceback, unchanged bytes and explicit unconfirmed
stop remain asserted.

Before correction, the first thirteen selected cases produced twelve failures
and one pass. After correction, an intermediate complete run had 124 passes and
one CLI-fixture failure; its assumed first Docker command was incorrect. The
final fixture names and verifies the daemon-unconfirmed scenario accurately.
The final unfiltered run passed all 125 Python cases at 94.24% combined coverage
with the unchanged 90% floor. Ruff and strict mypy passed. Independent source
and test review: Must 0 / Should 0 / Nice 0 after verification.

Evidence: `/tmp/popcorntv-327-preflight-before.log`,
`/tmp/popcorntv-327-preflight-after.log`,
`/tmp/popcorntv-327-preflight-final.log`. Earlier filtered diagnostic invocations
were not accepted as complete runs by the completeness wrapper. No failing run
is reclassified as successful. Global L1/L2 and exact-head attestation remain
required before publication/merge.

## Responsibility refactor and failed global gate — 2026-11-18

The complete gate on `e432866` recorded 22 successful steps followed by a
SonarQube failure: 33 new violations, new-code coverage 95.3% and duplication 0%.
The successful steps include 45 infrastructure tests, 125 Python tests, 11 Node
controller tests and 1,447 application tests without skips, plus Gitleaks,
Semgrep and the bounded OSV classification. The discovery build and a fresh
real-container journey passed (one test in 111.90 seconds). The Radarr xUnit
target reused BuildKit cache; it is not two freshly executed tests in this run.
Browser checks, later container/source/image scans and SBOM were not reached.
No successful gate attestation was written.

The follow-up refactor separates credential validation, inspected binding
decoding, host configuration, Radarr RSS configuration, image provenance,
image scanning, effective network validation and loopback binding validation.
The orchestration retains validation and write order, immutable scan identities,
fresh reads after uncertain writes and the existing ownership/cleanup boundaries.
Named constants retain the same bounded subnet, service label and endpoint
policies. Test assertions are separated without removing a condition; the
exception test constructs its input before the exception boundary.

Independent architecture and correction reviews found Must 0 / Should 0 / Nice 0.
The architecture review found no justified additional design pattern: cohesive
functions satisfy the current responsibility boundaries without another layer.
Targeted execution passed all 125 Python tests in 103.42 seconds, with 94.38%
combined coverage against the unchanged 90% floor. All 11 Node tests passed;
controller coverage remains 96.50% lines / 92% branches / 100% functions.
Ruff, Prettier and strict mypy on the gate's exact five-file Python scope passed.
An earlier manually broadened mypy command mistakenly included the existing
untyped infrastructure-runner tests and failed with 218 errors in two files;
that diagnostic is not a successful gate check or a newly changed source scope.

A subsequent diagnostic Sonar scan of the uncommitted refactor also failed;
its remaining issue inventory must be reconciled before publication/merge.
No rule exclusion, changed threshold, suppression or issue-status change was
used. Explicit HTTP destinations, the RFC1918 allocation bound, termination
control flow, trusted operator toolchain and categorical no-traceback logging
remain visible for their security review. The global gate remains RED.

### Final inventory extraction and proposed issue dispositions

The diagnostic reduced the inventory from 33 to nine issues without changing
an issue status. Its one remaining complexity finding concerns Docker IPAM and
host-route collection. `occupied_docker_networks()` now owns the Docker adapter;
`occupied_networks()` combines its allocations with host routes. Empty Docker
inventory still permits host-route inspection. Independent delta review found
Must 0 / Should 0 / Nice 0. The complete Python suite passed again: 125 tests in
100.40 seconds, 94.30% combined coverage with the same 90% floor. Ruff, format and
strict mypy on the five-file gate scope passed. The diagnostic scan of this final
extraction confirms all complexity findings resolved: eight issues remain,
new-code coverage is 95.3% and duplication is 0%. Its exit code is still 1:
the unresolved issue count exceeds the unchanged zero-violation threshold.

The following are proposed individual dispositions, not applied statuses or a
global scanner exception. The owner must approve the residual local trust and
transport choices before applying accepted-risk dispositions.

| Rule | Count | Technical disposition proposed |
|---|---:|---|
| S4036 | 2 | Retain operator toolchain trust for `pnpm` and `osv-scanner`: execution enters through the pinned mise environment; the controller is an unprivileged local gate, not a service accepting remote command names. Resolving the same ambient PATH to an absolute path alone would not harden this boundary. |
| S5332 | 2 | Retain HTTP only for the installation's bounded private Docker service addresses or loopback publication. Proxies are disabled, redirects refused and actual topology/publication inspected. This does not provide confidentiality against the host administrator. |
| S1313 | 1 | The explicit RFC1918 constant bounds validation/allocation; it is not an external service destination. Collision detection includes Docker allocations and nondefault host routes. |
| S5709 | 1 | The signal-control exception intentionally traverses ordinary exception handlers, reaches existing `BaseException` cleanup boundaries and exits with status 143. Replacing its base class is not behavior-neutral. |
| S5886 | 1 | Type-analysis false positive: `dataclasses.replace()` retains the runtime `Installation` type; strict mypy accepts the annotated return. |
| S8572 | 1 | Categorical CLI logging intentionally omits traceback and chained exception data to avoid exposing credentials/provider payloads. Preserve that security contract instead of enabling exception logging. |

No issue in this table is closed by this record. No merge authorization follows
from targeted tests or these proposed dispositions.
