# Discovery native-package correction — #464

The corrected local images clear six libxml2 findings and pass the existing disposable real-container journey.

- Scope: local AMD64, empty discovery services, no source configured, no retrieval or Pi deployment.
- Implementation: `0a58df8`, branch `fix/464-discovery-libxml2`.
- Decision: separate security prerequisite for #459, owner accepted on 2026-11-27 (465/500; extending #459 390/500, waiting upstream 260/500).

## Problem and correction

The gate on PR #463 refused startup at the Prowlarr image scan. Both Prowlarr and the existing rebuilt Radarr contained `libxml2=2.13.9-r3`, affected by six HIGH findings: CVE-2026-11979, CVE-2026-86138, CVE-2026-86139, CVE-2026-86140, CVE-2026-86142 and CVE-2026-86143.

The next official Prowlarr nightly (`3.1.0.5797-ls32`) and stable (`3.1.0.5799-ls170`) candidates retained the findings. A narrow native-package update to `2.13.9-r5` cleared them. The application revisions and pinned bases remain unchanged; no new waiver or scanner suppression was added.

Prowlarr now uses a locally built image. Its exact base-digest and package-patch labels are verified before scanning, then its immutable ID is used for bootstrap, publication and rollback. Radarr retains its source/ImageSharp checks and adds the package label. All three discovery images forbid automatic registry pulls.

## Actual corrected image identities

These are Docker image IDs inspected and scanned during the real-container run, not mutable tags or registry manifest digests.

| Image | Immutable image ID | HIGH/CRITICAL findings |
|---|---|---:|
| Prowlarr | `sha256:533d112d949ba3b8ad89e4fb54981633de3d2523c30512dba626a50751282714` | 0 |
| Radarr | `sha256:c48bd433b585f518a40d737b2bfd06e48ed47e64e5fc6395898e0bc284898129` | 0 |
| Ingress | `sha256:046cae7f2a8b9a7349207d2caf42d25fecfbafed5a1406b1838711a76a0b7179` | 0 |

The standard BuildKit secret mechanism was used for Radarr. Existing source/frontend and ImageSharp regression layers were cached; the build is not a fresh execution of those two upstream regression cases. The native-package layers were built, and the runtime journey was executed afresh.

## Verification

- `mise x -- just discovery-build`: passed for Prowlarr, Radarr, ingress and the cached regression target.
- Existing real-container journey: 1 passed in 68.51 seconds; private bootstrap, authentication, restart and network isolation exercised with disposable state.
- Controller tests: missing/incorrect base or patch labels refuse startup; all three images retain their scanned identity through normal startup and failed-authentication rollback.
- `mise x -- just check` on `0a58df8`: exit 0, 2,025 tests, discovery coverage 94.34%, retrieval coverage 93.13%.
- Hadolint includes the new Dockerfile and passed. The existing informational Gluetun consecutive-RUN notice remains.
- Semgrep: 225 rules, 237 targets, zero findings; existing worktree `safe.directory` warning remains.
- Secret scan, lint, strict typing, formatting and dependency checks passed.

Ignored local scan evidence is retained under `.trivy/discovery-{prowlarr,radarr,ingress}-*.json`; coverage reports are under the existing ignored coverage directories.

## Remaining qualification

- Complete L2 on published `ac9f688`: passed, including fresh real-container acceptance (1 passed in 67.38 seconds), production build, 7 Chromium smoke cases with API doubles, SonarQube PASSED, image/config/source scans and SBOM. The signed attestation was published and verified with the full commit SHA.
- Deterministic documentation presence: 771/817 (94.37%) using TypeScript 5.9.3 AST and Python AST across production public/exported declarations; tests, fixtures, generated/vendor code, private members and documented companion types excluded. Excluding experimental scripts: 730/775 (94.19%). This measures presence, not quality; the independent semantic review covers changed code.
- Retained L2 run: `20261127T111552Z-ac9f688f584e2ab979fbbe60a8aa338013c7fce2-1247850` under the worktree's local gate evidence directory. This evidence-only follow-up requires its own exact-head gate before merge.
- ARM64/Pi runtime and any deployment: not performed.
- #459 remains a separate pending PR; these checks do not authorize its merge.
