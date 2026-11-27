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
| Tests and coverage | L1 passed again on published `69a8a82`: 2,017 tests |
| Whole-project documentation coverage | Deferred to pre-merge qualification |
| SonarQube | Not reached: discovery image scan blocked L2 |
| Secrets | L1 scan and manual implementation diff inspection passed |
| Production build and browser smoke | Not reached: discovery image scan blocked L2 |
| Signed attestation | Not created: L2 failed |
| Deployment | Not performed |

L1 passed; L2 is red and does not authorize a merge. The exact published head requires the signed gate before merge.

## Pre-merge attempts on `69a8a82`

- First run: L1 passed, then refused the discovery rebuild because the license-file environment variable was absent. Retained run: `20261127T103146Z-69a8a82ed6ab0c5cba4eccf10605c776a3ced94e-876491`.
- Licensed run: L1 passed; discovery images rebuilt with the existing BuildKit secret mechanism, using cached layers and cached ImageSharp regression results. The runtime test then refused startup when the Prowlarr image scan failed. Retained run: `20261127T104020Z-69a8a82ed6ab0c5cba4eccf10605c776a3ced94e-938941`.
- Blocking findings: six HIGH libxml2 advisories, installed `2.13.9-r3`, all corrected by `2.13.9-r5`. The existing rebuilt Radarr image has the same findings. No scanner rule or waiver was changed.
- The next official Prowlarr nightly image, `3.1.0.5797-ls32`, was also scanned and retains all six findings.
- Non-deployed experiments upgrading only libxml2 to `2.13.9-r5` passed the same image scanner with zero HIGH/CRITICAL findings on both Prowlarr and Radarr. Radarr retains `USER 1000:1000`. These experiments are scan evidence only; runtime qualification and repository integration remain pending.
- Local ignored scan records: `.trivy/459-prowlarr-candidate.json`, `.trivy/459-prowlarr-patched.json`, `.trivy/459-radarr-baseline.json`, `.trivy/459-radarr-patched.json`.

## Isolated local browser check

- Real development frontend and API on loopback, separate disposable database and empty media root, no TMDB key, no discovery/retrieval integration.
- Chrome: owner setup through the API, sign-in through the UI, profile selection, empty catalog and administration entry passed with a fictional test account.
- Observed API calls returned 200; no console errors or warnings were observed.
- This is not production-build acceptance, a video playback test or Raspberry Pi validation. The L2 production-browser smoke was not reached.

## Must have

Resolve the external discovery-image scan failure and re-run the complete signed gate before merging. No implementation-review finding remains in the HTTP protocol correction.

## Should have

None.

## Nice to have

None.

## Intentional

Catch the specific `http.client.HTTPException` family at the existing verification boundary rather than broadening startup to catch every exception.
