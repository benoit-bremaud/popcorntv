# Issue #307 — local CI validation

## Scope and revision

Local branch `docs/307-adaptive-wishlist-lifecycle`, code revision `9dcee95`, based on `main`.
The change delivers a design dossier, not the runtime acquisition/progressive playback system.
It includes the subsequently confirmed per-episode notifications, original/French audio with
French subtitles, automatic signed-in-user acquisition, and child invitation requirements (#316).
Detailed backend feasibility, numeric limits and parental defaults remain future-brick decisions.
No design acceptance, real service write, deployment, push or PR is implied by this report.

The owner's latest instruction explicitly requested local CI, replacing the earlier test deferral.
Checks used installed dependencies, Node 22.23.4 and the repository's existing configurations.
Standalone pnpm 10.30.3 embeds Node 20 and its shim was unavailable in nested scripts; a temporary
wrapper outside the repository restored nested command lookup. Tests ran directly with Node 22
for readable output. No dependency installation or CI/CD pipeline change was made.

## Results

| Check | Result | Evidence |
|---|---|---|
| Workspace TypeScript checks | PASS | All three packages, `tsc --noEmit` |
| ESLint and log-coverage rule | PASS | `pnpm lint` after excluding unrelated agent worktrees |
| Prettier | PASS | `pnpm format:check` |
| Shared tests and coverage | PASS | 57 passed; lines/statements/branches/functions 100% |
| Server tests and coverage | PASS | 814 passed, 7 skipped; lines 98.40%, statements 97.23%, branches 92.81%, functions 96.14% |
| Web tests and coverage | PASS | 485 passed; lines 98.96%, statements 98.61%, branches 93.87%, functions 98.23% |
| Workspace production builds | PASS | Shared/server TypeScript builds and web Vite production bundle |
| Chromium smoke | PASS | 2 tests passed, existing catalog and Back/reload scenarios |
| Gitleaks full history | PASS | Redacted scan reported no leaks; rerun after final commits if preparing a push |
| SonarQube local analysis/gate | PASS | Analysis uploaded and processed; `QUALITY GATE STATUS: PASSED` on local project `popcorntv` |

Totals: **1,356 passed and 7 skipped** unit/component/integration tests, plus **2 passed** browser tests.
Skipped tests are not counted as verified scenarios. Browser tests use the existing Vite dev-server
configuration and API mocks, not a deployed service or a production-preview configuration.

## Failures found and repaired

1. ESLint and Prettier traversed unrelated `.claude/worktrees` checkouts. Added matching ignore
   entries; no application source or tests were excluded.
2. Two existing web tests failed because ICU renders UTC as `GMT+00:00` on this machine.
   The formatter now normalizes zero offset to `Z`; a regional winter/summer regression case
   verifies that daylight-saving offsets remain intact. The same fix had previously been
   prepared on the separate local tooling branch; it is now included in this branch.
3. Sandbox networking prevented Vite from binding its local port. The unchanged browser smoke
   ran with host permission. The local SonarQube scan similarly needed host network access.

## Limits

No recovery backend, source availability, partial-file playback, language-track acquisition or
child-account enforcement was tested: those are specified future work, not implemented here.
An independent read-only adversarial review covered `main...1011f04`. It found no blocking
functional/code defect and two documentation corrections: option C totals 340/500 and T-24/T-25
must remain in the traceability table. Both are corrected; verification of the fix commit is pending.
This review does not constitute owner acceptance of the draft design. Mermaid source
was inspected but not rendered. Docker/image scans and live staging QA were not run for this
scope. No signed gate attestation was produced, and results do not authorize deployment or merge.
The local scan logs are in `/tmp/popcorntv-local-ci/` and may be ephemeral; this report preserves
summaries only and contains no credentials.


Relative Markdown file links were also checked locally: 25 targets, no missing files.
The final redacted Gitleaks scan at `1011f04` covered 228 commits and reported no leaks.
