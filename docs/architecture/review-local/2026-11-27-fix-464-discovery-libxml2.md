# Local review — discovery libxml2 correction

The security prerequisite patches the native parser package while preserving scanned-to-started image identities.

- Date: 2026-11-27.
- Scope: `origin/main...0a58df8`, issue #464, plus the evidence-only follow-up.
- Checks: independent correctness, architecture, documentation and test-quality reviews; container policy and security diff inspection; local execution.
- Verdict: Must 0, Should 0, Nice 0 on the final implementation.

## Review rounds

- Round 1: no blocking correctness or architecture finding. Test review requested an identity assertion on rollback; documentation review requested the tuple return order. The stale Dockerfile count was also removed.
- Verification on `0a58df8`: rollback assertions cover all three services; documentation clarifications verified; no regression or new finding. Implementation push gate open, subject to L1 completion.
- No additional abstraction or lifecycle controller was introduced. Existing image inspection, scan and Compose boundaries are reused.
- The documentation-presence estimate on changed public callables is 5/5, not whole-project coverage.
- Optional hosted review: not run.

## Execution

| Check | Result |
|---|---|
| Complete L1 on `0a58df8` | Exit 0; 2,025 tests passed |
| Discovery component coverage | 94.34% combined |
| Retrieval coverage | 93.13% combined |
| Shared coverage | 100% |
| Server coverage | 98.64% lines, 93.58% branches |
| Web coverage | 98.99% lines, 94.01% branches |
| Real-container discovery journey | 1 passed in 68.51 seconds |
| Corrected discovery image scans | Zero HIGH/CRITICAL on all three exact image IDs |
| Hadolint, typing, lint, formatting, hooks, dependencies | Passed |
| Secrets | L1 scan and manual diff inspection passed |

Full identities and limitations are recorded in [the QA record](../qa/2026-11-27-issue-464-discovery-libxml2.md).

Semgrep scanned 237 targets with 225 rules and zero findings; its existing worktree warning remains. The existing React `search` warning is unrelated. The build reused cached upstream ImageSharp regression layers; real-container acceptance ran afresh.

## Pre-merge gate on `ac9f688`

| Step | Status |
|---|---|
| Tests and coverage | Full L2 passed: 2,025 L1 tests, 1 fresh real-container journey, 7 Chromium smoke cases |
| Documentation presence | 771/817 (94.37%) across production public/exported declarations; deterministic AST count; quality/freshness review of changed code passed |
| SonarQube | PASSED |
| Production build and browser smoke | Passed; Chromium uses API doubles |
| Image/config/source scans and SBOM | Passed |
| Signed attestation | Published and verified on full SHA `ac9f688f584e2ab979fbbe60a8aa338013c7fce2` |
| Deployment | Not performed |

The gate is green on the SHA above. The evidence/log-only follow-up must pass its own complete signed gate before merge; this document does not substitute for that exact-head attestation.

Documentation counting used TypeScript 5.9.3 AST and Python AST, excluding tests, fixtures, generated/vendor code, private members, bare reexports and documented companion aliases. Operational tooling and experimental scripts were included conservatively; excluding experiments gives 730/775 (94.19%). Presence is distinct from the independent quality/freshness review. Counter scripts and symbol inventories are retained in the local `/tmp/popcorntv-464-doc-*` evidence files.

## Must have

None in the implementation review. Verify the final published-head signed gate before merge.

## Should have

None remaining.

## Nice to have

None remaining.

## Intentional

The small derived Prowlarr image retains the reviewed upstream application and base; it changes only the native package and enforces the same non-root defaults as the existing runtime contract.
