# Issue 308 — slow recovery, partial restart and generation identity

Three additional controlled experiments pass; the research remains partial pending its final adoption decision.

## Scope and provenance

Date: 2026-11-13. Code commit: `e7174ab`. Measurements and source SHA-256 values are in the
[JSON record](2026-11-13-issue-308-recovery.json). Node 22.23.4, existing FFmpeg 8.0.1,
qBittorrent v5.3.0 / WebAPI 2.16.2 / libtorrent 2.1.2.0. Linux x64 host, not the Pi.
The existing digest-pinned image and private internal-only peer topology are unchanged.
Only generated media is transferred; no public tracker, indexer, service credential or VPN is used.

## Real slow transfer

The synthetic movie has 1,572,516 bytes and 30 seconds duration. The configured download limit
is 32,768 bytes/s, below its average consumption of approximately 52,417 bytes/s. The experiment
explicitly selects the full-file gate; it does not implement or validate the product estimator.

- Independently verified completion: 65,873 ms after transfer monitoring started.
- Effective completion rate: 23,872 bytes/s, including monitoring/peer startup overhead.
- First decoded frame: 65,932 ms, all 1,572,516 verified bytes available.
- Independent disk comparison confirms the full reference is present at first frame.
- Decoded video/audio frame hashes and French captions equal the complete reference.

An earlier run without resource snapshots completed at 52,197 ms and first frame at 52,322 ms.
These are separate observations, not a performance guarantee or a constant-bitrate simulation.

## Controlled interruption before completion

The client is stopped through its real API while incomplete, its read handle is closed, and its
container is gracefully restarted. The harness authenticates again, opens a new read-only handle
and independently revalidates persisted bytes from offset zero before resuming the private peer.

- Verified prefix before requesting restart: 327,680 bytes.
- Verified prefix restored after restart: 606,208 bytes, still incomplete. More pieces can settle
  between the observation and the completed stop; restored coverage must never lose the prefix.
- First decoded frame after restart: 30,411 ms from initial monitoring, with 606,208 verified bytes;
  independent disk evidence rejects a stale telemetry-only claim of incompleteness.
- Complete download at 40,337 ms; full bytes, decoded frames/audio and captions match the reference.
- The subsequent completed-file restart check also passes.

This proves controlled stop/graceful restart recovery before completion. It is not a crash, packet
blackhole, stalled-browser seek or continuous playback across a downloader restart.

## Rename during active decode

A synthetic immutable file is fed through its original open descriptor. A half-file range gate
prevents the feeder from completing before the first decoded frame. On that frame, rename the
file to its final path and replace the original pathname with different bytes.

The latest targeted run demonstrates an active frame before input completion. The original
handle continues decoding the reference, a new open using stale generation identity is rejected,
and reopening the renamed inode after checking device/inode/size/mtime succeeds. Full decoded
video/audio and captions equal the reference. Exact input byte count at first frame is in JSON.

The filesystem identity is a local POSIX experiment, not protection against in-place modification,
remote storage semantics, inode reuse or an actual Sonarr/Radarr import. A production cache must
own generations and protect active readers; this experiment does not adopt such a runtime lease.

Negative cases include missing/replaced/mutated files, incorrect identity fields, unexpected
accepted opens, failed mutation and failed descriptor closure. Late mutation errors are merged
after mutation settles, preserving original decoder failures and either unsafe-cleanup marker.
All remaining descriptor closes are attempted; uncertain closure retains the private workspace.

## Resource observations and bounds

Docker snapshots were taken once during transfer and once at completion for the two clients:
12.05–14.88 MiB memory, 21–28 processes and 0.02–0.17% CPU in the recorded samples. They are
point observations, not peaks, capacity tests or aggregate browser/FFmpeg/host memory measurements.
Each client still has a 384 MiB memory limit, one CPU and 128-process cap; the fixture is small
and one preparation runs at a time. Pi throughput, thermal behavior and concurrent playback
remain target validation for later delivery.

Each Docker command uses the remaining 300-second run budget, capped at 120 seconds. The
transfer poll additionally checks its 180-second transfer deadline. Decoding has a 90-second
bound and cleanup a separate 120-second command allowance, so 180 seconds is not a global runtime
claim. The new slow/restart test allowance is 600 seconds. The rename experiment uses a 15-second
decoder bound and five-second missing-range waits. These bounds do not establish production limits.

## Verification and review

The consolidated opt-in run passed 55 tests, zero failures/skips, in 406 seconds. It includes
existing real player, private backend, combined nominal/cancel/rejected-resume, deterministic
media mechanics, and the new slow/restart/rename cases. The final concurrent mutation-error
correction was made after that run loaded the generation module; the latest generation suite
was separately replayed: six passed, zero failures/skips, 100% lines/functions and 97.73% branches.
No coverage exclusions were added. The combined coverage of the earlier consolidated snapshot
was 95.89% lines / 93.82% branches / 92.73% functions; its older generation row must not be used
as coverage of the corrected source. The latest targeted figure supersedes it for that module.

Adversarial review found and verified fixes for lost cleanup markers in failed opens, negative
assertions and late mutation failures concurrent with decoder failure. Final code verdict:
Must 0 / Should 0, draft-only push subject to final local checks. Existing seven application-suite
skips remain separate from these zero-skip experiment runs. No merge/release attestation is issued.

Reproduce opt-in experiments using the pinned runtime:

```sh
RUN_BACKEND_RECOVERY_SPIKE=1 node --test --test-concurrency=1 scripts/qbittorrent-spike.test.mjs
RUN_GENERATION_SPIKE=1 node --test scripts/generation-spike.test.mjs
```

These are separate from `pnpm coverage`. The backend tests need Docker; generation tests need FFmpeg.
Keep normal application checks and the current [review record](../review-local.md) explicit.

## Remaining acceptance

Finalize the backend adoption comparison, first-release format/track contract and unknown-file
verified-range strategy. Known full-reference bytes remain an experiment oracle. Arbitrary-film
caption readiness, actual arr import, production adaptive logic, household authorization and the
Pi are not validated by these fixtures. Keep #308 open and the PR draft until the research
conclusion and remaining acceptance disposition have been reviewed.
