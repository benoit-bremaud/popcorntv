# Issue #308 — combined real recovery and caption-ready playback

The real isolated qBittorrent source and built PopcornTV player are connected in a bounded synthetic experiment; production readiness remains **PARTIAL**.

## Scope and code

Implementation: `3433352`, following player baseline `eb5b01f`. This uses the already pinned
qBittorrent 5.3.0 / API 2.16.2 / libtorrent 2.1.2.0, two private internal peers, the existing
production web bundle, real application routes/repositories and Chromium. No public tracker,
indexer, title, VPN credential, production library or Pi deployment is involved.

The backend owns the generated source, download cache, client configurations and unique Compose
project. The player borrows only a read-only target, coverage accessor, immutable caption snapshot,
known synthetic metadata/reference and a bounded resume operation. Cookies/passwords/environment
are not exposed to that callback. Projects have unique names so one run cannot remove another's
containers through the former shared project name.

## Readiness proof

1. The backend polls actual piece states, but advances **verified** coverage only after independently
   reading and matching each new target range. Short reads, changed bytes or regressed coverage fail.
2. At an incomplete prefix the real target is stopped, and its actual API state must settle to stopped.
   A 64 KiB snapshot is read from verified target bytes and copied privately; it is never taken from
   the complete control. The latter is only the metadata/subtitle-comparison oracle.
3. External-source player setup opens the cache read-only, never copies/truncates it, and checks
   inode, size and mtime across paused setup. Its media root is restricted to the target data folder.
4. Caption extraction uses the immutable snapshot through the same tracked FFmpeg boundary as
   video. The real subtitle API's entire VTT must match the complete-reference VTT before Play.
   The derived caption cache is then removed, proving subsequent loading does not require stale
   mtime reuse. The complete control is not fed to subtitle extraction.
5. The real resume must succeed. An explicitly experimental, bounded, abortable barrier holds HLS
   segment responses until the actual browser text track parses the expected cue. No frame may
   already have decoded. After release the cue must be in activeCues at video time 0.2–2 seconds.
6. The first browser frame must have incomplete independently checked target bytes. Both backend
   coverage and browser time must advance, then normal viewing must reach the thirty-second end.
   Cancellation is separately replayed; completed-file byte equality and client restart are checked.

This demonstrates the fixture's **one complete early French cue**. It does not establish that all
captions of an arbitrary film can be known from an early prefix. Full-file waiting remains required
when complete mandatory subtitle readiness cannot otherwise be established. The exercised audio
path is selected French HLS; default-audio progressive direct play is not enabled or certified.

## Evidence and replay status

The first combined nominal run passed before defensive review fixes: at the first observed browser
frame, 573,440 / 1,572,516 bytes were verified, the independent cache read was incomplete, and the
French cue was active at video time 0.213418 s. Normal playback and completed-transfer restart passed.
Its 848 ms startup measurement begins at **Play/resume after preparation**, not cold acquisition.

The version-frozen extended replay on `3433352` completed: **31 passed, zero failed/skipped**,
about 255 seconds, with these cases:

- 15 fast player/reader/gate/cleanup tests and 8 fast backend/evidence tests.
- Two fast combined CLI/consumer-shape tests.
- Existing controlled-writer browser completion/cancellation scenarios.
- Standalone backend reference decode/restart regression.
- Real combined completion, real combined cancellation and a rejected-resume negative scenario.

The [machine-readable observations](2026-11-12-issue-308-combined.json) preserve the replay:

| Observation | Recorded result |
|---|---|
| Nominal first frame after Play/resume | 768 ms; 458,752 / 1,572,516 bytes verified; independent cache read incomplete |
| Active French cue | Present at video time 0.213083 s, after a fresh real subtitle extraction |
| Nominal completion | Real video reaches its normal end; completed target bytes match reference; restart restores coverage |
| Cancellation first frame | 749 ms; 589,824 bytes verified; active cue at 0.201182 s |
| Cancellation | Real DELETE 204; no page/transport error; reader cleanup completes while download subsequently finishes safely |
| Resume rejection | No caption-barrier-release or first-frame event; player cleanup completed and the intended error propagated |

These sub-second figures exclude peer connection, prefix preparation, metadata setup and caption
preparation. They cannot be presented as cold-acquisition startup time. The full nominal test took
about 74 seconds including setup, complete viewing and client restart checks.

The [QA ledger](../../testing/qa-matrix.md#progressive-recovery-experiments-308-2026-11-12)
separates observed successes, narrow unit evidence and unexecuted product cases.

### Coverage of the extended harness suite

Native Node coverage includes all three changed harness modules and has no exclusion directives:

| Module | Lines | Branches | Functions |
|---|---:|---:|---:|
| Combined CLI/composition | 94.12% | 90.00% | 100.00% |
| Player/reader/readiness | 98.67% | 94.62% | 94.83% |
| Backend/controller | 93.06% | 90.08% | 83.33% |
| Combined total | 96.07% | 92.34% | 91.21% |

Remaining gaps include direct executable entry lines, bootstrap/command failure diagnostics,
whole-orchestration cleanup-retention branches and selected error callbacks. Unit tests exercise
the cleanup/error-combination rules, but actual FD-close failures are not injected into Docker.
These gaps are named rather than covered by assertion-free tests or claimed as 100%. The
reproduction below sets a rounded ratchet of 96/92/91 for lines/branches/functions.

Documentation presence was checked on exported top-level functions with the TypeScript parser:
player 10/10, backend 8/8, combined driver 2/2. Contracts describe borrowed-source ownership,
immutable caption input, explicit metadata/reference oracles, failure propagation and cache
retention. Additional source changes after the measured code freeze are contract comments only;
the percentages above remain the observations for executable version `3433352`.

### Application regression and security checks

The final local application checks passed: typecheck, ESLint/log discipline, Prettier, build and
workspace coverage. Vitest reported 1,356 passed and 7 existing skipped tests: shared 57, server
814 (+7 skipped), web 485. Line coverage remains shared 100%, server 98.4%, web 98.96%.
The build retains its existing web chunk-size warning; it is not a failed build.

Gitleaks found no secrets in the changed scripts/reports. Relative report/traceability links were
checked and the independent reviewer checked the QA claims against the measured JSON. These are
not a completed release gate: existing skipped tests, Sonar/release checks, arbitrary-title QA,
staging deployment and Pi validation are not silently promoted to passed. No push/PR/merge or
deployment occurred in this step.

## Adversarial review

The owner explicitly requested early independent adversarial review. The reviewer inspected design
and implementation read-only, without Docker or secret access, then verified corrections.

| Finding | Change | Verification |
|---|---|---|
| Telemetry-only prefix could be mistaken for verified bytes | `verifyCachePrefix` reads/checks target ranges before advancement | Short/corrupt/regressed unit cases and real nominal source |
| Controlled-writer setup could overwrite the download | Separate external-source branch, read-only open and unchanged paused identity | Real nominal setup plus independent incomplete-cache proof |
| Warmed subtitle cache could be invalidated by mtime | Actual immutable target-prefix input; cleared derived cache; real track/cue checks | Real nominal VTT equality and active cue |
| One failed close could skip later cleanup | `cleanupAll` attempts every player resource | Unit fault test |
| Backend FD failure could mask `cleanupIncomplete` and delete an unsafe cache | `closeTransfer` aggregates primary and close failures, preserving the marker; unsafe workspace retained | Unit cumulative consumer + FD failure and later-close assertion |
| Rejected resume could release buffered video before failure surfaced | Resume awaited before caption barrier release | Real rejected-resume scenario in extended replay |
| Cancellation could ignore page/transport faults | Same error assertions before positive cancel result | Combined cancel replay |
| Any consumer object could set browser/HLS verification | Minimum evidence validator requires actual HLS/read-only/caption/incomplete proof | Unit malformed/missing evidence cases |
| Broad media root included sibling client configs/source | Restrict root to target-data | Real combined replay |
| EPIPE was swallowed until watchdog | Prompt reader/child abort with categorical diagnostics | Fast broken-pipe test |

Reviewer conclusion after fixes: no remaining Must among the reported findings. The subsequent
extended suite passed the version-frozen implementation. Static review is not represented as test
execution. Two non-blocking caveats remain: startup timing excludes preparation, and rejected
resume currently checks instrumentation rather than an independent segment-byte counter.

## Reproduction and diagnostics

Prerequisites: built application (`pnpm build`), Node 22+, existing FFmpeg/ffprobe, installed
Playwright Chromium and the pinned backend image already pulled/scanned. Nothing installs or
deploys automatically. Run from the repository root, with access to local Docker.

```sh
node scripts/combined-player-spike.mjs --run

RUN_COMBINED_SPIKE=1 RUN_PLAYER_SPIKE=1 RUN_BACKEND_SPIKE=1 \
node --test --test-concurrency=1 --experimental-test-coverage \
  --test-coverage-lines=96 --test-coverage-branches=92 --test-coverage-functions=91 \
  --test-coverage-include='**/scripts/player-spike.mjs' \
  --test-coverage-include='**/scripts/qbittorrent-spike.mjs' \
  --test-coverage-include='**/scripts/combined-player-spike.mjs' \
  scripts/player-spike.test.mjs scripts/qbittorrent-spike.test.mjs \
  scripts/combined-player-spike.test.mjs
```

JSON diagnostics identify source verification, snapshot readiness, FFmpeg startup/closure, caption
barrier release, first frame, concurrent progress, normal end, cancellation and cleanup. Commands
carrying credentials never echo stdin/argv/raw stderr. Player CLI errors emit safe codes, and the
real application's existing redaction remains active. Unsafe cleanup retains private workspaces
instead of pretending closure succeeded; no shared volume/image prune is used.

## Remaining production gate

Keep #308 and the overall verdict PARTIAL. Full-film language/subtitle readiness, variable-bitrate
forecasting, progressive direct play/resume/seek, source-generation replacement/import, concurrent
users, unexpected VPN failure, Pi performance and the wishlist/notification/child-account workflows
remain outside this proof. The local experimental barrier and pipe adapter are not enabled in
production by these commits.

API sources checked: [official stop/start documentation](https://github.com/qbittorrent/wiki/blob/master/WebUI-API-%28qBittorrent-5.0%29.md)
and [qBittorrent 5.3 state serialization](https://github.com/qbittorrent/qBittorrent/blob/release-5.3.0/src/webui/api/serialize/serialize_torrent.cpp).
