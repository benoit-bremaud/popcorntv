# Local review — PopcornTV local discovery

This record distinguishes resolved source-review findings and targeted acceptance from the owner's deferred global validation.

- Date: 2026-11-15.
- Branch: `feat/327-local-discovery`; base `origin/main` at `9ef3db5`.
- Latest reviewed source: `d6a833e` (Opus adversarial reviewer, second round); its findings are
  corrected in the commit that follows it, whose verification is recorded in the pull request.
- Dimensions: fresh adversarial source review, design/container verification,
  independent test-quality review, documentation/traceability reconciliation,
  targeted security and correctness checks.
- Source verdict at `d6a833e`: Must 1 / Should 4 / Nice 9, push gate closed; all Must and Should
  corrected in the following commit, remaining Nice items filed (#349).
- Publication/execution status: pending. No global-green claim, signed attestation,
  push, PR publication, merge or deployment is recorded by this review.

## Adversarial review

The first three rounds were run by a fresh frontier Codex reviewer with separate context. The
later rounds were run by the fresh Opus `adversarial-reviewer` agent. No hosted reviewer is claimed.

| Round | Source | Result |
|---|---|---|
| Review | d0cfa62 | Must 1: anonymous first listen can expose API key; Should 2: reproducible resize regression and stale traceability; adversarial push gate closed |
| Verification | 02bb954 | Original three findings fixed; new Should: malformed XML escapes categorical CLI handling; no new Must |
| Verification | 16327d2 | XML failure translated safely; actual CLI regression checks no Docker call, no traceback, unchanged bytes; all findings fixed, none regressed; adversarial push gate open |
| Opus review | 3a7381a | Must 1: #327 status contradicted between spec and glossary; Should 9: untested fail-closed paths, expired keys kept serving, failed scan on a rerun left the stack published, unenforced `uv.lock`, wrong deployment note, heavy gate steps on every diff without an owner decision, missing ADR and commands, Semgrep XML finding, lint broken by `data/`; Nice 9; push gate closed |
| Opus verification | d6a833e | Round-one findings fixed or filed (#347–#350); new Must 1: `DISCOVERY_PATHS` missed the Trivy ignore file, the test runner, the mise pins and renames; Should 4: no mechanism behind the #315 replay, path list not fully pinned, `status` not fail-closed on a failed proof, this record stale; Nice 9; push gate closed |
| Corrections | after d6a833e | Path list completed and pinned, renames and quoted names handled, `LOCAL_CI_DISCOVERY=1` forced replay recorded as `run (forced)`, evidence `scheduled` until the discovery steps pass, `status` stops the owned services on a failed proof, sensitivity figures corrected |

The adversarial dimension's open line is not an execution gate. Global CI and
exact-head attestation remain pending under the explicit owner deferral to #315.

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

## Global execution gate — deferred

The last complete L1 run on d0cfa62 failed on fixture response interpolation. That
input was removed and its targeted recheck passed; the entire recipe has not
subsequently been certified green. The owner explicitly requested that global CI
wait until the pre-Pi deployment milestone. No step is waived or retroactively green.

Pending: complete L1 rerun, build/regression targets, SonarQube including the added
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

_None._

### Intentional boundaries

The local fixed proxy does not change bb-homelab's central Caddy or existing
staging. No real provider, downloader, media file, acquisition scheduler,
progressive playback or ready notification is installed by this brick.
