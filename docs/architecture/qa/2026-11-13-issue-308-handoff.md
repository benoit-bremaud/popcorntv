# Issue 308 continuation handoff

The bounded construction decision is accepted; finish the publication/merge gate before the next implementation brick.

## Starting point

- Issue: https://github.com/benoit-bremaud/popcorntv/issues/308
- Branch: `test/308-adaptive-wishlist-feasibility`; publish and keep its PR in draft until acceptance is complete.
- Specification: [adaptive wishlist feasibility](../specs/adaptive-wishlist-feasibility.md).
- Latest integration evidence: [combined experiment](2026-11-12-issue-308-combined.md).
- QA inventory: [QA matrix](../../testing/qa-matrix.md).
- Publication checks and independent review: [local review](../review-local.md).

## Established evidence

The private synthetic qBittorrent transfer feeds the existing browser/HLS player before completion,
with French audio and an active French startup caption, then reaches normal end. Cancellation and
rejected preparation have bounded checks. Reference-byte comparison is an experiment oracle, not
an adopted mechanism for validating unknown real titles. VPN namespace behavior was exercised
separately; it was not combined with an actual torrent transfer. No production readiness feature
or household automation is enabled by this branch.

## Remaining acceptance work, in order

1. Read the [new recovery/generation report](2026-11-13-issue-308-recovery.md): real slow fallback,
   controlled partial-transfer restart and active-decode rename are now measured. These are
   bounded fixtures, not general unknown-title or crash resilience guarantees.
2. Review [ADR-0034](../decisions/0034-verify-pieces-before-progressive-playback.md) and the
   [accepted research conclusion](2026-11-13-issue-308-conclusion.md). The owner validated A and
   the weights/contract, explicitly preserving multiple indexers and future client diversity.
   Keep #308 open until the final publication/merge gate completes.
3. Review the resource snapshots and keep Pi performance validation explicitly pending; they are
   point observations of the clients, not whole-application peak measurements.
4. Update acceptance traceability and perform the final independent review/local gate, then decide
   whether #308 can close. Prepare #316 next, before #309; child policy is a prerequisite for automatic
   household activation. Current experiments do not install/integrate the full arr suite.

The experiments use generated media, private trackerless peers and disposable owned containers.
Never substitute public trackers or real titles. Do not print environment files, VPN configuration,
keys, session cookies or public IP addresses. A live VPN replay is opt-in and separate from mock tests.
The corrected VPN harness needs Python >=3.11. Keep temporary secrets private and retain their
workspace if container removal or process/reader closure is unconfirmed.

## Local checks

Use the pinned Node 22.23.4 runtime and pnpm 10.30.3. Application commands are `pnpm typecheck`,
`pnpm lint`, `pnpm format:check`, `pnpm coverage`, `pnpm build`; they do not include spike tests.
Run the five `scripts/*spike.test.mjs` files explicitly with Node's test runner. Docker Compose
configuration rendering is needed by backend topology tests even without starting containers.
The extended real experiments require their explicit `RUN_*_SPIKE=1` opt-ins; use one test at a time.
Run Python boundary tests with `scripts/nordvpn-spike.coveragerc` and coverage.py; require 100% with
no exclusions. The fresh application pass has 1,363 passed and zero skipped when `FFMPEG_IT=1` enables the seven
previously unexecuted integration cases; see the [final local report](2026-11-13-issue-308-final-local-ci.md).
Keep that opt-in enabled for the final gate. A passing test suite is not an attested merge/release gate.

## Reusable methods backlog

Owner-requested follow-up in agents-skills: [verified playback experiments #419](https://github.com/benoit-bremaud/agents-skills/issues/419),
[failure-safe cleanup #420](https://github.com/benoit-bremaud/agents-skills/issues/420), and additions to
[existing NordVPN scope #412](https://github.com/benoit-bremaud/agents-skills/issues/412).


## Accepted source-diversity requirement

REQ-28 requires multi-indexer discovery through Prowlarr in #310. REQ-29 keeps the core preparation
identities independent of client names; #325 tracks the later second backend. Do not confuse
indexer/provider diversity with installing a second client. No blind duplicate submission or
cross-generation playback splice is permitted during fallback. The initial qBittorrent choice
is accepted; a secondary client is not installed or selected by this backlog update.


The final private replay also enables `RUN_BACKEND_FAILURE_SPIKE=1` for TC-17, a negative test for
resource-observation failure after complete coverage. PR #324's P2 propagation finding must be
fixed, verified and answered inline before merge; consult the latest review ledger for its status.


## Owner delivery reporting

After every merged PR, report estimated overall project progress and current-epic progress before
starting the next brick. Explain the basis and uncertainty; a closed-brick count is not a weighted
effort estimate, and test coverage is not product completion. This owner instruction is also in
CLAUDE.md so the next session retains it.
