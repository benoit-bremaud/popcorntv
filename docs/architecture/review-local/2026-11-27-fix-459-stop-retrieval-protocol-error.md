# Local review — retrieval HTTP protocol failure

HTTP protocol failures during startup verification now refuse readiness and stop the client before the gateway.

- Date: 2026-11-27
- Scope: issue #459, `c27c631...502a799`, two Python files.
- Checks: independent correctness, architecture, documentation and test-quality reviews; security diff inspection; L1 execution.
- Verdict: Must 0, Should 0, Nice 0 on the implementation diff.

## Regression evidence

- Before the fix: all three new cases failed with uncaught protocol exceptions.
- After the fix: generic protocol failure, invalid status line and incomplete body all return exactly `verification_unavailable`.
- Tests exercise real startup, verification and cleanup with doubles at HTTP and process boundaries. They assert startup occurred, both ordered stop sequences, stopped final state and retained credentials.
- No real tunnel, retrieval service or source was used.

## Independent review

- Round 1 on `502a799`: Must 0, Should 0, Nice 0; implementation push gate open.
- Architecture: error translation stays in verification; startup retains cleanup responsibility.
- Documentation: existing shutdown contract remains accurate; changed public-function documentation presence estimated at 1/1.
- Tests: three component cases are proportionate; no identified domain mocking or weak assertion.
- Security and correctness: remote exception details are suppressed; existing ownership checks and ordered cleanup remain in force.
- Containers: not applicable; no image or configuration change.
- Optional hosted review: not run.

## Local execution on `502a799`

`mise x -- just check` exited 0. No hosted CI workflows are configured.

| Suite | Passed | Coverage |
|---|---:|---|
| Local runner | 74 | Not measured |
| Retrieval controller | 350 | 93.19% combined |
| Discovery infrastructure | 125 | 94.30% combined |
| Dependency controller | 11 | 96.50% lines, 92% branches, 100% functions |
| Shared contracts | 57 | 100% |
| Server, including real FFmpeg fixtures | 905 | 98.64% lines, 93.58% branches |
| Web | 495 | 98.99% lines, 94.01% branches |
| Total | 2,017 | Suite-specific thresholds passed |

- Type checks, lint, formatting, dependency checks, secret scan and hook validation passed.
- Semgrep: exit 0, 225 rules, 237 targets, zero findings. The worktree `safe.directory` warning remained; the scan reported explicit exclusions (seven patterns, one oversized file and 25 ignored files).
- Existing React `search` element warning remains in the web test environment (#337).
- Reports: ignored `coverage/`, `packages/shared/coverage/`, `apps/server/coverage/` and `apps/web/coverage/`.
- Manual diff inspection: no credentials or personal data; tracked environment examples contain placeholders.

## Pre-merge gate

| Step | Status |
|---|---|
| Tests and coverage | L1 passed on `502a799`; repeat as required for the published head |
| Whole-project documentation coverage | Deferred to pre-merge qualification |
| SonarQube | Deferred to the published-head L2 gate |
| Secrets | L1 scan and manual implementation diff inspection passed |
| Production build and browser smoke | Deferred to the published-head L2 gate |
| Signed attestation | Not created; branch not published |
| Deployment | Not performed |

L1 passed; this record does not authorize a merge. The report-only follow-up requires review verification before publication, and the exact published head requires the signed gate before merge.

## Must have

None.

## Should have

None.

## Nice to have

None.

## Intentional

Catch the specific `http.client.HTTPException` family at the existing verification boundary rather than broadening startup to catch every exception.
