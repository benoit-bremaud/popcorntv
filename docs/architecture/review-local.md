# Local review — issue 308 feasibility experiments

The branch may be published as a draft; acceptance, merge and release gates remain incomplete.
The latest follow-up below supersedes the earlier list of unmeasured research cases.

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
