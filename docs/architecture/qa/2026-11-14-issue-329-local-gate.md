# Signed local gate validation

Issue #329 migrates verification to pinned local recipes and real signed exact-head merge evidence; failed and successful runs retain separate identities.

## Bootstrap and implementation

The owner accepted the design, weights and existing primary SSH identity on 2026-11-14.
PR #334 merged the public signer trust store at `feb0621` before any attestation. No private
key was copied. The implementation at `d748f1d` adds locked mise tools, Lefthook/just recipes,
self-contained trusted-main attestation, complete-suite guards and retained local run logs.
The six replaced hosted workflows are removed; GitHub Actions were already disabled.

The first complete source check and installed pre-push hook passed: 37 infrastructure tests,
1,446 application tests with real FFmpeg, frozen install, types/lint/format, OSV, secrets and
Semgrep. Pre-push completed in 126.15 seconds (124.63 seconds for checks). These are pre-push
results, not evidence that the later signed gate passed. Existing fixture timeouts and zero
retry settings remain unchanged.

Independent architecture/security and test-pertinence review plus correction verification
found Must 0 / Should 0 before publication. Additional findings in the first real gate are
recorded separately below. [Case design](cases/329-signed-local-gate.md) and
[operation](../specs/local-gate-operation.md) define scope and executable commands.

## First real signed gate — failed

Head `d748f1da7a2d6bbe316ea5785951fe96d4f74ddc`, run started 2026-11-14T10:06:57Z.
The gate confirmed pending, recorded prerequisite versions and ran the required local checks.
Its infrastructure suite, statics, OSV and Semgrep passed. The server suite had 903 passed
and one failure: the unchanged 5-second SubtitleExtractor concurrency test timed out. Shared
and web suites passed; the overall gate remained red. No successful attestation was issued.
Sonar/build/browser/container gate steps were not reached and are not claimed for this run.
The gate's retained result is failure, with per-step logs and the failed server JSON report.

Issue #339 identifies the fixture's request-order assumption: real asynchronous filesystem
admission can start the second request first. Completing the first observed FFmpeg invocation
and then awaiting the first requested promise can deadlock the test while its fake next
invocation is still awaiting manual completion. This failure does not establish a production
extraction deadlock.

## Concurrency regression correction — #339

The test observes real mkdir operations through a spy and waits for both admissions before
checking the single-run limit. It completes observed invocations before awaiting both request
results. A parameterized reverse-order scenario gates the first request only after its real
mkdir, starts the second request and proves track 1 starts first. Cleanup releases barriers,
drains fixture completions and restores the observer. Production extraction code is unchanged.

The targeted suite passes nine tests; types and formatting pass. Independent review and
test-pertinence correction verification found Must 0 / Should 0.

Two bounded mutations in disposable source copies test this regression. The unmodified
forced-reverse control passes. Restoring the old `await first` reproduces the unchanged
5,000 ms timeout. Bypassing maxRuns fails the exact single-invocation assertion (two observed),
rather than timing out. These filtered diagnostic runs are not counted as full-suite passes;
no mutation is retained in the repository.

A clean-shell check after this correction executed all 1,447 application tests and 37
infrastructure tests successfully, but remained red because ESLint rejected the observer's
inline `typeof import(...)` type annotation. An explicit type-only namespace import fixes
that lint error; targeted lint/types/format and all nine extractor tests then pass. The
clean-shell check must pass again on the corrected commit; its earlier failure is retained.

## Final signed gate and merge

Corrected head `e7e555e2e684d7b838a702169fe38eb9b794f656` passed the real gate. All 22
logged checks exited zero, with 138.04 seconds of recorded check time: 57 shared, 905 server
and 485 web tests (1,447 total), 37 infrastructure tests, zero skipped/todo, and two browser
smokes without retries/flaky outcomes. Clean-shell pre-push passed in 93.56 seconds.
SonarQube passed (95.4% new coverage, 0% new duplication, zero unresolved issues), as did
types/lint/format, frozen install, OSV, Gitleaks, Semgrep, Hadolint, Trivy configuration/source/
image scans, the current-head image build and SPDX SBOM generation.

The gate published a signed Git note before success status at 2026-11-14T10:35:44Z. A
separate remote verification succeeded. No open inline review thread or actual review finding
remained; the optional automated hosted review was unavailable because of quota. Local code
and test-pertinence correction reviews were Must 0 / Should 0. `mise x -- just merge 340`
verified the signature/status again and merged PR #340 at `6a3c4ac7bc5e764c3d520753f321f4a4261e1aa4`
on 2026-11-14T10:37:47Z. That squash has a different identity and requires its own gate before
any later authorized deployment.

## Security and QA boundaries

#335 removes the two OSV findings with parent-qualified dependency overrides and validates
real disposable Drizzle migration generation; see the [dependency report](2026-11-14-issue-335-dependency-remediation.md).
#338 confines container scans/build context to the application rather than local agent
worktrees. #336 unsupported ESLint and #337 React search-element test warnings remain tracked
with an exit before #315 A; neither is a waived failed gate check.

The QA ledger has E329-01–06, E335-01 and E339-01–02. The implementation PR records the final
head and signed result; this report does not retroactively change the failed d748f1d run. No staging
or Pi deployment, real acquisition, child-policy acceptance or release tag is claimed.

Reusable lessons are tracked in agents-skills #485. This change leaves the functional project
estimate at approximately 60% and the initial ten-brick epic at three completed bricks (30%).
