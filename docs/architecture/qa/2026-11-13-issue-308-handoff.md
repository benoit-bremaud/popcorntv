# Issue 308 continuation handoff

This experiment remains partial; continue the same issue before implementing the next wishlist brick.

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
2. Record one final adoption decision, with weighted options, supported format/track restrictions,
   the production verified-range contract and explicit full-file fallback conditions.
3. Review the resource snapshots and keep Pi performance validation explicitly pending; they are
   point observations of the clients, not whole-application peak measurements.
4. Update acceptance traceability and perform the final independent review/local gate, then decide
   whether #308 can close. Proceed to #309 afterwards; #316 remains a prerequisite before automatic
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
no exclusions. The application suite still contains seven pre-existing skipped tests: report them,
never present the draft publication checks as a completed release/merge gate.

## Reusable methods backlog

Owner-requested follow-up in agents-skills: [verified playback experiments #419](https://github.com/benoit-bremaud/agents-skills/issues/419),
[failure-safe cleanup #420](https://github.com/benoit-bremaud/agents-skills/issues/420), and additions to
[existing NordVPN scope #412](https://github.com/benoit-bremaud/agents-skills/issues/412).
