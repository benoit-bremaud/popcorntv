# Issue 308 — proposed feasibility conclusion

The evidence supports conditional construction of a qBittorrent verified-reader adapter, pending owner decision validation.

## Decision and current status

[ADR-0034](../decisions/0034-verify-pieces-before-progressive-playback.md) is the proposed decision:
qBittorrent plus a bounded hash-verified buffer reader scores 410/500; native libtorrent scores
335/500 and remains the design fallback. SABnzbd and completed-file-only playback do not satisfy
the progressive capability requirement. Weight sensitivity is explicit: doubling the verified-read
weight makes libtorrent lead. Owner validation concerns the weights and contract, not a hidden
request to deploy, buy a service or install the entire arr suite.

**Current status remains PARTIAL / decision proposed.** Conditional GO means construction may
proceed after the decision is accepted and final research review passes. It is not proof of
arbitrary-title playback and is not product, merge or deployment approval. Keep #308 open and
PR #324 draft until that disposition is confirmed.

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

This table retains the original issue's criteria and distinguishes evidence from proposed decisions
and later runtime work. It does not silently replace an unmet research criterion with a promise.

| Original #308 criterion | Evidence or disposition | Status |
|---|---|---|
| Compare backend telemetry/layout/read/priority/restart APIs, versions, weighted decision and fallback | Capability comparison in the specification, official API docs, measured qBittorrent versions, proposed ADR-0034 with native fallback and sensitivity | Comparison recorded; owner weight/contract validation pending before adoption |
| Controlled fixture with contiguous start, metadata, audio and supported captions; no percentage/sparse-file proof | Media mechanics, backend, player and combined reports; incomplete disk/reference check and active French startup cue | Proven for the named synthetic profile only |
| Slow/fast/interrupted recovery, existing playback boundary, cancellation and resource limits | Real slow/full-file gating; graceful partial restart; real HLS browser normal/cancel; bounded waits and resource point samples | Bounded research observations pass; crash/Pi/capacity remain explicit limitations |
| Access before arr import and stable final handoff | Separate owned cache contract; active descriptor survives simulated POSIX rename/path replacement; stale opens fail | Simulated boundary proven; real configured arr import belongs to runtime integration |
| Supported first-release formats and safe complete-file fallback | ADR-0034 candidate MP4/H.264/AAC/HLS profile, required languages and complete French caption admission, explicit unsupported cases | Concrete proposal; requires acceptance and later implementation before activation |
| Opt-in harness and go/no-go report without relabelling full-file fallback as progressive proof | Existing opt-in fixtures plus hash reader; progressive and full-file results are separately reported | Report exists; proposed conditional construction GO, closure pending review/owner validation |
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
App sources have not changed; existing application baseline checks and seven skipped tests remain
explicit. No signed merge/release gate is claimed by this research conclusion.

Primary references, consulted 2026-11-13:
[qBittorrent API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29),
[BEP 3](https://www.bittorrent.org/beps/bep_0003.html),
[libtorrent API](https://libtorrent.org/reference-Torrent_Handle.html),
[SABnzbd workflow](https://sabnzbd.org/wiki/extra/job-options).
