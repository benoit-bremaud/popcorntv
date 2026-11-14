# Signed local gate protocol

Issue #329 makes local verification reproducible and binds merge permission to the exact checked commit.

Status: accepted by the owner on 2026-11-14, including option A and its weights. The public
primary SSH identity is authorized for local-gate signing. This document
does not authorize deployment. The existing owner-approved bootstrap waiver remains explicit
until the replacement is operational. Source: #329 and the owner's local-only CI rules.

## Requirements

- **REQ-30:** expose `just fast`, `just check`, `just gate` and `just merge` with pinned
  tooling, deterministic failure propagation and a documented check inventory.
- **REQ-31:** attest only a clean commit published to the canonical repository's origin;
  require an SSH signature trusted by `origin/main`, a matching repository and commit,
  and a successful current `gate` status before merging that exact pull-request head.
- **REQ-32:** failed, missing, skipped or interrupted required checks cannot authorize merge.
  Keep Sonar mandatory and preserve failed-run evidence. Never convert a rerun into a retry
  that conceals the original failure.
- **REQ-33:** bound Vitest workers explicitly, retain `FFMPEG_IT=1`, document runtime and
  resource settings, and exercise the actual signed-gate failure paths.

## Scope and responsibilities

The repository owns a small command layer and a focused attestation script, not a new CI
framework. `just` orchestrates existing package and Makefile commands; `mise` pins tools and
checksums; `lefthook` invokes the same recipes for commits and pushes. Application packages
must not depend on gate code. Git, SSH signing and GitHub transport are external boundaries.
Tests replace transport, while using real temporary Git repositories and real SSH signatures.

| Entry point | Required scope | Boundary |
|---|---|---|
| `fast` | Staged secret scan, applicable staged formatting/lint and commit-message hook | Staged paths only; target under 10 seconds |
| `check` | Types, lint, formatting, coverage, script/wiring checks, secrets, dependency and source security scans | Target under 3 minutes; measure rather than omit slow checks |
| `gate` | `check`, build, Sonar with quality-gate wait, production-build browser smoke, applicable container scans and SBOM | Exact published head; every required result retained |
| `merge` | Fresh PR head, trusted attestation and latest gate status, then SHA-pinned squash merge | No automatic deployment or admin bypass |

The following inventory defines the accepted migration contract. Implementation
review verifies the actual wiring against it. Preserve existing pinned container scan images in the
Makefile as their single source of truth. Remove replaced hosted workflows in the migration
PR. GitHub-only checks such as service-hosted CodeQL/dependency-review/Scorecard are listed
honestly as unavailable locally; local SAST, vulnerability and hygiene checks are documented
as alternatives, not claimed to be identical engines. No hosted jobs are added or triggered.

| Existing workflow/job | Local command contract | Version/configuration/globs | Applicability |
|---|---|---|---|
| `ci/verify` install and statics | `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | Node 22.23.4, pnpm 10.30.3; package tools from frozen lockfile; existing ESLint/Prettier configs, workspace-wide | Every check; install during setup with lock consistency checked |
| `ci/verify` tests | `FFMPEG_IT=1 pnpm --workspace-concurrency=1 -r --if-present test --coverage --maxWorkers=4` | Frozen Vitest/coverage dependencies and existing package configs | Every check; candidate worker setting measured before acceptance |
| `ci/verify` build | `pnpm build` | Frozen TypeScript/Vite and package build configs | Every gate |
| `docker-security/hadolint` | `make lint-docker` | Hadolint 2.15.1, digest in Makefile; `.hadolint.yaml`, Dockerfile | Docker path filter below, otherwise explicit not-applicable |
| `docker-security/config` | `make scan-docker-config` | Trivy 0.76.0, digest in Makefile; Dockerfile and existing ignore config | Same Docker filter |
| `docker-security/image` | `docker build --pull -t popcorntv:<sha> .`, then `make scan-docker-image IMAGE=popcorntv:<sha> TRIVY_EXIT=1` | Same Trivy pin and `.trivyignore.yaml`; retain machine-readable report | Same Docker filter |
| `gitleaks/scan` | `gitleaks git --redact` | Local pin 8.30.1; full history, existing ignore configuration | Every check; replaces hosted action, not an asserted bundled-version match |
| `codeql/analyze` | CI-only engine, removed hosted job; local Semgrep alternatives remain mandatory | Existing hosted codeql-bundle-v2.27.3; JavaScript/TypeScript. Semgrep CE 1.181.0 pinned image, `p/javascript`, `p/typescript`, `p/nodejs`, metrics off | Application source, excluding generated/build/env paths |
| `dependency-review` | CI-only service, removed hosted job; local `osv-scanner` lockfile scan | Hosted action v5.0.0; local OSV 2.7.1 against pnpm-lock.yaml | Every check; advisory data requires reachable service/cache and failure is explicit |
| `scorecard/analysis` | CI-only service, removed hosted job; repository/hook/security configuration review | Hosted action v2.5.0; not represented as an equivalent local Scorecard engine | Configuration review and local wiring tests |

The existing Docker filter is Dockerfile, .dockerignore, package.json, pnpm-lock.yaml,
apps/server/package.json, apps/web/package.json, packages/shared/package.json,
.hadolint.yaml, .trivyignore.yaml, Makefile and its workflow file. Include new local gate
configuration/scripts in that filter so a changed scanner cannot self-exempt. A first
bootstrap or missing/invalid comparison base requires container checks. Build a current-head
image for image scans; do not scan an unrelated cached tag. File-filter non-applicability is
determined from the fetched main merge base and recorded, distinct from a skipped required step.

Additional L2 checks use the existing Sonar project configuration with quality-gate wait,
Playwright from the workspace lockfile against the current production build, Trivy filesystem
scan/SBOM using the same pinned engine, and documentation review. Scripts receive ShellCheck
0.11.0 and local wiring tests. Hook orchestration pins are just 1.59.0, lefthook 2.2.2 and
mise 2026.10.23; all non-system CLI artifacts require lockfile checksums. System Docker,
Python, FFmpeg and sonar-scanner versions are captured as prerequisites rather than falsely
claimed mise-managed pins. Security findings, unavailable required services and broken report
generation remain blocking.

Initial worker candidate: four workers per package with workspace concurrency one. The
previous successful evidence used four workers per package with packages running concurrently;
the sequential candidate still needs measurement. Keep fixture timeouts unchanged. Pin the
validated Node 22 runtime and pnpm version and ensure pnpm executes under that Node, rather
than the installed standalone binary's embedded Node 20. Add runtime guards and verify a
clean shell without the temporary helper directory. Missing infrastructure may be reported
while remaining checks run, but the overall gate exits nonzero and cannot attest success.

Nightly timers, cassette frameworks, deployment changes and speculative mutation/performance
infrastructure are outside this bounded migration. Inventory existing applicable checks first;
newly discovered requirements must be implemented here or explicitly tracked with an exit date.

## Trust and publication protocol

1. Derive the canonical repository from `origin` and reject unsupported or ambiguous remotes.
   Bind all GitHub operations explicitly to it; `GH_REPO` must not redirect signing or merging.
2. Fetch authoritative origin refs, capture the clean head, and confirm it is published to
   that origin. A commit found only on another remote is insufficient.
3. Gate and merge acquire the same repository-wide local lock before reading or changing
   gate status, holding it through completion or the merge response. Reject overlapping
   operations, including different heads sharing the checkout. Require confirmed publication
   of `gate=pending` before starting checks. If publication cannot be confirmed, abort without
   claiming to invalidate earlier valid remote evidence. After confirmed pending, a previous
   success on the same commit must not authorize a failed rerun.
4. Run required checks, recording the head, versions, outcomes and redacted diagnostics.
   On failure publish failure if transport is available, exit nonzero and issue no success.
   A transport outage after pending leaves merge blocked.
5. Recheck the clean head after checks. Sign the payload `gate <owner/repo> <full-sha>` with
   SSH namespace `local-ci`. Verify the resulting signature against the allowed signer file
   fetched from trusted `origin/main` before publication. Never trust the PR's replacement
   signer file. Private key material is never copied into the repository or logged.
6. Fetch and update `refs/notes/gate` without force. Preserve unrelated notes and retry only
   genuine concurrent ref updates, at most five attempts. Authentication/network errors fail.
   Publish `gate=success` last, after the verified signed note is available remotely.
7. Merge rereads the PR head, fetches trusted main and the note, and verifies signature,
   payload repository/SHA and the latest exact-head gate status. Use
   `gh pr merge --squash --match-head-commit <sha>` without `--admin` or `--auto`.
   Any head movement requires a new gate. Report-only commits also require a new gate.

GitHub statuses and SSH signatures are an owner-trust mechanism, not proof against a
compromised authorized workstation or signing identity. A local lock does not serialize
independent machines: concurrent runs for the same head are unsupported until a cross-machine
lease exists, and must not be launched. The initial operating contract is one gate operator.
Key revocation takes effect through a reviewed main-branch signer update and fresh verification.

## Bootstrap in two pull requests

1. Review and validate this conception. Bootstrap PR carries the public signer trust store
   and the previous parser-merge journal entry. It does not add `scripts/attest.sh`, so the
   existing global merge guard still identifies the repository as unattested. Run existing
   local checks and record the final bootstrap exception explicitly. Do not close #329.
2. After the trust store has merged, implement recipes, pins, hooks, attestation and tests in
   a new #329 branch. Exercise real signed notes against trusted main, then use the new
   `just merge` verifier for this PR. Record that main's global guard gains its trusted
   verifier only when this implementation PR merges. Subsequent merges use that main verifier.

Neither PR changes global hooks, bypasses the global guard or deploys PopcornTV. A squash
merge creates a different commit; that main commit needs its own gate before any later
deployment. Report product/epic progress after each merged PR.

## Signing identity decision

A reuses the existing primary SSH identity with project-local configuration. B creates a
dedicated local-CI identity. C publishes an unsigned status only. The owner accepted A on 2026-11-14; the bootstrap trust store records its public key. Existing primary and homelab identities are distinct; the homelab key is not
proposed. Fingerprints and agent availability were inspected, not private key contents.

Scores are engineering judgments (0–5), based on observed agent availability and the stated
single-operator workflow. Owner validation includes the weights.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Trusted-main signature, mandatory | 40 | 5: signed verification | 5: signed verification | 0: absent, eliminated |
| Separation of signing purpose | 20 | 3: existing identity reused | 5: separate identity | 5: no private identity involved |
| Implementation simplicity | 20 | 5: existing loaded key | 3: generation and enrollment | 5: status only |
| Operator setup effort | 10 | 5: project-local configuration | 3: new credential lifecycle | 5: no key setup |
| Ongoing identity maintenance | 10 | 5: reuse existing lifecycle | 3: additional credential | 4: status access still maintained |
| Total /500 | **100** | **460** | **420** | **290, eliminated** |

Weighted points by row: A = 200+60+100+50+50; B = 200+100+60+30+30;
C = 0+100+100+50+40. A leads B by 40 points. If purpose separation doubles to 40
and other weights scale by 0.75, A=420, B=440, C=342.5 (eliminated): B wins.
If it halves to 10 and others scale by 1.125, A=480, B=410, C=263.75 (eliminated).
Thus A is recommended for minimum setup, but this is sensitive to the owner's desired
identity separation. B is the fallback; activation requires a named, expiring credential,
protected private storage and agent enrollment before adding its public key to main.

## Traceability and validation

[SEQ-attest-local-gate](../diagrams/local-gate/02-sequence-attest-local-gate.md) realises
REQ-30–32. [Designed cases](../qa/cases/329-signed-local-gate.md) cover REQ-30–33.
Only a sequence is needed: no application domain entities, new runtime deployment or user
data flow is introduced. Requirements/traceability, dependency direction, proportionality
and pattern fit passed independent review and correction verification (Must 0 / Should 0)
before owner validation. No implementation test results are claimed by this specification.
