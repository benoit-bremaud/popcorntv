# Local review — Pi staging build version

The Pi build derives its displayed version and image revision label from one reviewed Git archive.

- Date: 2026-11-19
- Base: `8a3be17a4e6ba548f55c04bc4c942e3673748d39`
- Reviewed code: `488a148957772218f902317b7d6b78160effe1ab`
- Scope: native build entry point, Pi runbook, version spec, and build command tests.

## Adversarial review

| Round | Result |
| --- | --- |
| 1, `f6fe5f6` | One Must. An unrelated caller-supplied version was accepted for an otherwise correctly labelled archive. The mutable image tag also introduced a concurrent-build ambiguity. |
| 2, `488a148` | The archive supplies both version and label. The caller cannot supply a separate version, and inspection follows this build's immutable result. No outstanding Must. |

## Findings

| Severity | Location | Result |
| --- | --- | --- |
| Must | `deploy/pi-staging/build-image.sh:6` | Resolved. Derive the 12-character version from the archived commit and retain the full revision in the OCI label. Tests cover an advanced checkout and an extra version argument. |
| Should | `deploy/pi-staging/build-image.sh:29` | Resolved. Inspect the image ID written by this build instead of the mutable tag. Test inspection failure. |
| Should | `deploy/pi-staging/build-image.sh:21` | Resolved. Clear the inherited builder and Docker endpoint overrides before using the local daemon. |
| Should | `deploy/pi-staging/README.md` | Resolved. Document the one-argument archive workflow, Git on the Pi, and omission of `APP_VERSION` from the runtime environment file. |

## Execution checks

- ShellCheck and the 26 focused Pi tests passed, including eight image-build tests.
- The real ARM64 build on the Pi emitted immutable image ID `sha256:1b3446659a5c1921ca308643c4d15dbd2113d81cd36233bc21a0333f0a260a0c`. Its isolated runtime returned `/health` 200, anonymous `/version` 401, and authenticated `/version` with `488a14895777`.
- The account menu test exercises display of the returned application version. The live staging menu check follows deployment of the merged revision.
- There are no pull-request workflows. The signed gate, SonarQube, and end-to-end tests run on the published head before merge.
- `mise x -- just check` passed on the reviewed code with 1,654 tests across the workspace, infrastructure and dependency check suites. The Python suite reported 94.30% coverage. Semgrep reported zero findings and emitted a linked-worktree Git metadata warning.
- Source review gate open. The publication commit adds this report.

## Archive integrity follow-up

The published review identified that the Git archive header can keep its commit
after a payload change. The build now compares a private snapshot with the
SHA-256 recorded on the approved checkout before invoking Docker. A regression
changes the Dockerfile payload while preserving the archive header and verifies
that the build stops before Docker. The 28 focused Pi tests and ShellCheck passed.
The gate on the previous head was stopped to validate this correction on the
publication revision.
