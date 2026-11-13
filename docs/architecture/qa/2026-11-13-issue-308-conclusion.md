# Issue 308 — accepted bounded feasibility conclusion

The owner accepted construction of a bounded qBittorrent verified-reader adapter with source diversity preserved.

## Decision and current status

[ADR-0034](../decisions/0034-verify-pieces-before-progressive-playback.md) is the owner-accepted construction decision:
qBittorrent plus a bounded hash-verified buffer reader scores 410/500; native libtorrent scores
335/500 and remains the design fallback. SABnzbd and completed-file-only playback do not satisfy
the progressive capability requirement. Weight sensitivity is explicit: doubling the verified-read
weight makes libtorrent lead. The owner validated A and the weights/contract on 2026-11-13, with an explicit source-diversity
requirement: multiple indexers in #310 and a future second download backend in #325.

**Research outcome: GO for the accepted bounded construction contract.** This does not establish
arbitrary-title playback or production readiness. Decision acceptance is complete; final publication
and merge gates still govern #308 closure. No runtime feature, deployment, subscription or source
acquisition is activated by this research conclusion.

## Hash-verified reader evidence

A separate real-backend replay uses the same private synthetic torrent and existing pinned client.
The authenticated API supplies file size/layout, piece size and piece digests. The standalone
reader receives a frozen bounded manifest, reads one entire downloaded piece, verifies the
protocol digest and feeds that exact buffer to FFmpeg. It accepts no full-file reference bytes.

Measured on 2026-11-13, Node 22.23.4 / qBittorrent v5.3.0 / WebAPI 2.16.2:

- 96 pieces; all 1,572,516 bytes pass the hash reader.
- First frame at 19,343 ms after requesting the private peer, with 262,144 independently verified
  prefix bytes and an independently incomplete cache. Metadata admission precedes the timing origin.
- Completion at 29,236 ms. Decoded video/audio and captions match the full reference afterwards.
- Completed-file restart and persisted byte checks still pass.
- Fifteen tests pass with zero failures/skips, including malformed/oversized/sparse metadata,
  immutable copied hashes, incorrect state/index, short/corrupt reads and filesystem errors.

The [machine-readable record](2026-11-13-issue-308-hash-reader.json) contains source hashes and
observations. SHA-1 is the v1 protocol integrity check, not publisher authentication. Forty-character
IDs do not independently prove torrent version or cache identity: the fixture supplies known v1
metadata; runtime admission must implement the complete contract in ADR-0034.

**Important boundary:** the prefix poll and the browser adapter still compare to the known fixture.
This replay removes the reference from the standalone hash-reader boundary, not from the complete
orchestration or browser. The prior combined browser experiment validates the HLS path with its
reference-based adapter. These two experiments inform the runtime design; they do not together
claim an already implemented unknown-file browser reader.

## Acceptance disposition

This table retains the original issue's criteria and distinguishes evidence from accepted design decisions
and later runtime work. It does not silently replace an unmet research criterion with a promise.

| Original #308 criterion | Evidence or disposition | Status |
|---|---|---|
| Compare backend telemetry/layout/read/priority/restart APIs, versions, weighted decision and fallback | Capability comparison in the specification, official API docs, measured qBittorrent versions, accepted ADR-0034 with native fallback and sensitivity | Comparison and bounded construction contract accepted by owner |
| Controlled fixture with contiguous start, metadata, audio and supported captions; no percentage/sparse-file proof | Media mechanics, backend, player and combined reports; incomplete disk/reference check and active French startup cue | Proven for the named synthetic profile only |
| Slow/fast/interrupted recovery, existing playback boundary, cancellation and resource limits | Real slow/full-file gating; graceful partial restart; real HLS browser normal/cancel; bounded waits and resource point samples | Bounded research observations pass; crash/Pi/capacity remain explicit limitations |
| Access before arr import and stable final handoff | Separate owned cache contract; active descriptor survives simulated POSIX rename/path replacement; stale opens fail | Simulated boundary proven; real configured arr import belongs to runtime integration |
| Supported first-release formats and safe complete-file fallback | ADR-0034 accepted candidate MP4/H.264/AAC/HLS profile, required languages and complete French caption admission, explicit unsupported cases | Design accepted; runtime implementation/tests required before activation |
| Opt-in harness and go/no-go report without relabelling full-file fallback as progressive proof | Existing opt-in fixtures plus hash reader; progressive and full-file results are separately reported | Report exists; accepted bounded construction GO; final merge gate pending |
| Authorized isolated execution, no unauthorized source/service/VPN activity | Private trackerless peers, generated media, bounded local containers; historical VPN experiment separately authorized and documented | Scope respected; no public source, real Seerr write, service install or VPN change in this step |

## Required downstream work, not yet implemented

- #311: confined owned generations, validated backend/layout identity, storage/admission limits,
  protected active readers and handoff; align metadata response/count/buffer limits.
- #312: sustained throughput and remaining-buffer policy, degradation/full-file latch and invalidation.
- #313: replace the browser's oracle adapter with the accepted hash/range contract, bounded scheduling,
  generation binding, cancellation, unavailable seeks and unknown-file track/caption admission.
- #316 / #309 / #310 / #314: child policy, authorized persistent intents, daily discovery and actual
  ready-to-watch notifications; no current automatic household acquisition claim.
- #315: consolidated product, real configured-service integration and target QA. The recorded laptop
  observations do not establish Pi performance or whole-application peak resource use.

No known unsupported case is declared ready merely because its download finished. If integrity,
identity, required tracks/subtitles or authorization cannot be established, it remains not ready
or fails. Full-file preparation remains a fallback step, not a bypass of the readiness policy.

## Verification and handoff

The earlier consolidated experiment pass has 55 tests and is dated to its exact source snapshot.
The subsequent generation replay has six tests and 100% line/function, 97.73% branch coverage.
The hash-reader replay is a further distinct 15-test run; do not add those counts as unique tests.
Latest code, documentation review and publication checks are recorded in [review-local](../review-local.md).
App sources have not changed. The [fresh local pass](2026-11-13-issue-308-final-local-ci.md)
executes the seven opt-in FFmpeg cases: 1,363 passed, zero skipped with `FFMPEG_IT=1`. No signed merge/release gate is claimed by this research conclusion.

Primary references, consulted 2026-11-13:
[qBittorrent API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29),
[BEP 3](https://www.bittorrent.org/beps/bep_0003.html),
[libtorrent API](https://libtorrent.org/reference-Torrent_Handle.html),
[SABnzbd workflow](https://sabnzbd.org/wiki/extra/job-options).
