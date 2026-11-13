# Issue 308 — refreshed local application checks

All checks listed below pass on the proposed-decision code; research acceptance and the merge gate remain separate.

## Checked source and scope

Date: 2026-11-13. Checked HEAD: `08156c1ab2912526dd6a76468f35152ef2e52cc0`.
Node 22.23.4 / pnpm 10.30.3. No production source change or deployment was needed for this pass.
This report and the QA/review ledger are documentation added after the checked commit.

The seven previously skipped application cases are opt-in FFmpeg integration tests, not seven
accepted exceptions. Re-running with `FFMPEG_IT=1` executes them. The scanner's root-only skip
condition did not apply to this run. Historical records keep their original scope; this pass
supersedes the earlier current-state claim that these seven remain unexecuted.

## Results

| Check | Result | Scope |
|---|---|---|
| `FFMPEG_IT=1 pnpm coverage` | Passed; **1,363 passed, zero skipped** | Shared 57, server 821, web 485; 82 test files |
| `pnpm typecheck` | Passed | Workspace TypeScript checks |
| `pnpm build` | Passed | Shared/server output and production web bundle |
| Production-build Playwright smoke | **2 passed**, 6 seconds, zero skipped | Chromium catalog/detail/back/reload; network API responses stubbed, not a full deployed-system test |
| Local SonarQube | **Quality gate PASSED** | Configured apps/packages scope and updated lcov, not opt-in script analysis |
| Gitleaks 8.30.1 full history | **250 commits, no leaks** | Redacted, offline scan; new staged documentation scanned separately |
| Python VPN boundary tests | **10 methods passed**, 100% statements/branches | 211 statements, 62 branches, zero excluded; no live VPN/credential use |
| Latest experiment quick suite | Earlier current-source pass: **48 passed**, zero skipped | Five explicit Node test files, separate from application coverage |
| Latest real hash-reader replay | Earlier current-source pass: **15 passed**, zero skipped | Private qBittorrent fixture, standalone hash-reader path |
| Latest combined browser regression | Earlier current-source pass: **1 passed**, zero skipped | Private backend and actual built player with reference-based browser adapter |
| Public experiment documentation | **18/18 exported functions carry JSDoc** | 13 backend + 5 generation functions; presence count, not a repository-wide documentation percentage |

The earlier consolidated 55-test experiment and latest six-case generation replay retain their
source provenance in the recovery report. These counts overlap and must not be added as unique tests.
Lint/format and source/contract review passed before publication of the unchanged checked code;
no new production or test behavior is introduced by this documentation update.

## Application coverage

| Workspace | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Shared | 100% | 100% | 100% | 100% |
| Server | 97.43% | 92.88% | 96.47% | 98.63% |
| Web | 98.61% | 93.87% | 98.23% | 98.96% |

Coverage is measured by each existing Vitest workspace configuration; no exclusions were added.
The server entry-point exclusion predates this feature. The 18/18 documentation count is scoped
to the backend/generation experiment modules; it is not proof that all application/API docs are complete.

## Reproduction

Run the checked runtime, then `FFMPEG_IT=1 pnpm coverage`, `pnpm typecheck`, `pnpm build`.
The smoke uses the existing `apps/web/e2e/catalog.smoke.spec.ts` against `vite preview` serving
the built bundle at loopback port 5174; the temporary runner configuration stays outside the repo.
Run local sonar-scanner with quality-gate wait, the configured lcov reports and a private environment
token; never put credentials in command arguments or the report. The seven integration cases require
FFmpeg/ffprobe on PATH. Experiment tests remain separately opt-in.

Execution logs remain under `/tmp/popcorntv-local-ci/308-final-*.log` and `sonar.log` on this machine;
they are transient diagnostics, not dependencies needed to understand the committed result.

## Remaining decisions and gates

- At this checked run ADR-0034 was proposed. The owner subsequently accepted A and the bounded
  weights/contract, explicitly preserving multiple sources; current decision status is in ADR-0034.
  No runtime feature is enabled by either the tests or decision acceptance.
- This repository has no `scripts/attest.sh`/signed gate note; these green checks do not create an
  attested merge gate. No full security-tool baseline, staging feature acceptance or Pi QA is claimed.
- Actual unknown-file browser integration, full required-caption admission, owned runtime generations,
  arr service integration and child-account authorization belong to the explicitly listed later bricks.
- PR #324 remains draft; no merge or deployment is performed by this report.
