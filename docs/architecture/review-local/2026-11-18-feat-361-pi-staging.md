# Local review — Pi staging

Review the independent PopCornTV and Caddy staging deployment for #361.

- Date: 2026-11-18
- Initial revision: `ef11b7c`
- Base: `origin/main` at `ada6317`
- Verdict: all pre-push review findings classified Must are resolved. The signed merge gate and native Pi verification follow separately.

## Adversarial review

- Round 1: the storage tests always supplied successful mount, device, transport and Docker daemon-root observations. The project command reference still sent product QA to the local rehearsal. Both issues blocked publication.
- Round 2: storage tests prove refusal when the USB mount is absent, is the OS disk or is not USB, and when either daemon root is outside appdata. The command reference directs QA to the Pi staging runbook.
- The launcher now refuses a stale deployed Caddyfile before Docker inspection. The updated runbook requires stopping the staged proxy before replacing web assets and documents the native HTTPS check.
- Push gate: open from source review, subject to a passing `just check` on the publication revision.

## Findings

| Severity | Location | Result |
|---|---|---|
| Must | `scripts/tests/test_local_ci_pi_staging_storage.py:35` | Resolved by regression cases at the mount and daemon observation boundary. |
| Must | `CLAUDE.md:70` | Resolved by identifying localhost as rehearsal and linking the Pi QA entry point. |
| Should | `deploy/pi-staging/start.sh:7` | Resolved by matching the installed Caddyfile to the reviewed checkout before startup. |
| Should | `deploy/pi-staging/README.md:62` | Resolved by documenting TLS verification, partial startup handling and the stop-before-upgrade procedure. |
| Should | `deploy/pi-staging/compose.yml:119` | Verify whether Caddy's internal redirect listener needs the retained bind capability during native staging qualification. |
| Should | `deploy/pi-staging/Caddyfile:9` | Shared proxy header parity across independently deployed Caddyfiles is follow-up work. |

## Execution checks

- The initial revision passed `just check`, including the test suites, dependency checks and redacted secret scan. Semgrep completed with a linked-worktree Git metadata warning.
- The targeted Pi staging suite passed 17 tests after the fixes. Hadolint, ShellCheck, Prettier and the rendered staging Compose model were checked locally.
- The first pre-push hook exposed an infrastructure test isolation issue. Git's repository-local environment redirected fixture setup into the parent repository. The fixture runner now clears the variables listed by `git rev-parse --local-env-vars` before loading the tests.
- There are no pull-request workflows in this project. Signed attestation, SonarQube, end-to-end testing and the merge checks belong to the post-push gate. The native deployment and product QA have their own entry conditions.
