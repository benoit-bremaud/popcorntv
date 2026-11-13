# Local review — issue 308 feasibility experiments

The branch may be published as a draft; acceptance, merge and release gates remain incomplete.

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

Keep #308 open. The [handoff](qa/2026-11-13-issue-308-handoff.md) lists slow real recovery,
mid-transfer restart, rename/generation identity, final restricted adoption decision and target
resource observations. Wishlist activation and general progressive playback remain unimplemented.
