# Local review — retrieval HTTP protocol failure

HTTP protocol failures during startup verification now refuse readiness and stop the client before the gateway.

- Date: 2026-11-27
- Scope: issue #459, two Python files; original implementation `502a799`, rebased as `a568ae2` onto `7a95c5d` after PR #465.
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

## Historical gate before the prerequisite

| Step | Status |
|---|---|
| Tests and coverage | L1 passed again on published `69a8a82`: 2,017 tests |
| Whole-project documentation coverage | Deferred to pre-merge qualification |
| SonarQube | Not reached: discovery image scan blocked L2 |
| Secrets | L1 scan and manual implementation diff inspection passed |
| Production build and browser smoke | Not reached: discovery image scan blocked L2 |
| Signed attestation | Not created: L2 failed |
| Deployment | Not performed |

These failed attempts predate the security prerequisite. They are retained as evidence, not the status of the resumed head.

## Resumption after PR #465

- PR #465 merged as `7a95c5d`, correcting the six native-package findings in Prowlarr and Radarr. The implementation in this branch is unchanged apart from its rebase.
- Deterministic documentation presence on the resumed tree: 771/817 (94.37%), using the same TypeScript 5.9.3/Python AST method as the prerequisite. No new production public declaration was added by this fix.
- Fresh independent review on `64858db` found Must 0, Should 0 and Nice 0, and independently passed the 171-case retrieval module. The full retrieval suite also passed all 350 cases with 93.19% combined coverage.
- No deployment or real retrieval is included.

## Complete gate on resumed `64858db`

| Step | Result |
|---|---|
| L1 | 2,028 tests passed; exit 0 |
| Test coverage | Retrieval 93.19%, discovery 94.34%, shared 100%; server/web thresholds passed |
| Documentation presence | 771/817 (94.37%) |
| Real discovery containers | 1 passed in 68.41 seconds |
| Production build and browser smoke | 7 Chromium cases passed with API doubles; zero skipped, unexpected or flaky cases |
| SonarQube | PASSED |
| Configuration, source and image scans; SBOM | Passed |
| Secrets | Full scan and manual diff inspection passed |
| Signed attestation | Published and verified on `64858db59495a1683ef02d40516a4581a2db816f` |

All 31 retained gate steps exited 0. Evidence run: `20261127T153443Z-64858db59495a1683ef02d40516a4581a2db816f-3750163` in this worktree's gate records. The real-container case qualifies discovery services, not owner-run VPN failure acceptance. This evidence/log-only follow-up must pass its own exact-head signed gate before merge; these results do not transfer an attestation to a different SHA.

## Pre-merge attempts on `69a8a82`

- First run: L1 passed, then refused the discovery rebuild because the license-file environment variable was absent. Retained run: `20261127T103146Z-69a8a82ed6ab0c5cba4eccf10605c776a3ced94e-876491`.
- Licensed run: L1 passed; discovery images rebuilt with the existing BuildKit secret mechanism, using cached layers and cached ImageSharp regression results. The runtime test then refused startup when the Prowlarr image scan failed. Retained run: `20261127T104020Z-69a8a82ed6ab0c5cba4eccf10605c776a3ced94e-938941`.
- Blocking findings: six HIGH libxml2 advisories, installed `2.13.9-r3`, all corrected by `2.13.9-r5`. The existing rebuilt Radarr image has the same findings. No scanner rule or waiver was changed.
- The next official Prowlarr nightly image, `3.1.0.5797-ls32`, was also scanned and retains all six findings.
- Non-deployed experiments upgrading only libxml2 to `2.13.9-r5` passed the same image scanner with zero HIGH/CRITICAL findings on both Prowlarr and Radarr. Radarr retains `USER 1000:1000`. Their later repository integration and runtime qualification are recorded under #464 / PR #465.
- Local ignored scan records: `.trivy/459-prowlarr-candidate.json`, `.trivy/459-prowlarr-patched.json`, `.trivy/459-radarr-baseline.json`, `.trivy/459-radarr-patched.json`.

## Isolated local browser check

- Real development frontend and API on loopback, separate disposable database and media root, no TMDB key, no discovery/retrieval integration.
- Chrome: owner setup through the API, sign-in through the UI, profile selection, empty catalog and administration entry passed with a fictional test account.
- A locally generated 8-second synthetic H.264/AAC clip was added through the library UI and scanned: 1 added, none skipped. Direct playback returned 206, reached its full duration with no video error, and its watched state persisted after reload.
- Observed functional API calls succeeded; no console errors or warnings were observed.
- This is development-instance smoke, not production-build or Raspberry Pi acceptance. The initial L2 production-browser smoke was not reached before the prerequisite.

## Must have

None in the implementation review. The final published head must retain its own verified signed gate before merge.

## Should have

None.

## Nice to have

None.

## Intentional

Catch the specific `http.client.HTTPException` family at the existing verification boundary rather than broadening startup to catch every exception.
