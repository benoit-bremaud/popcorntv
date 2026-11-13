# ADR-0034 — Verify pieces before progressive playback

Use a bounded qBittorrent adapter for initial construction, preserving multiple indexers and future retrieval engines.

- Status: accepted by the owner on 2026-11-13; option A, proposed weights and bounded contract validated.
- Date: 2026-11-13.
- Scope: #308 research conclusion and constraints for #311–#313; no production activation.
- Evidence: [combined player](../qa/2026-11-12-issue-308-combined.md),
  [recovery/generation](../qa/2026-11-13-issue-308-recovery.md), and
  [hash-reader conclusion](../qa/2026-11-13-issue-308-conclusion.md).

## Context and drivers

Daily indexer discovery and active-transfer observation are different activities. Prowlarr manages
indexers, Sonarr/Radarr orchestrate series/movies, and a client retrieves bytes. PopcornTV must
independently decide when those bytes and required tracks can be played. A publication match,
client percentage, sparse file size or downloaded piece state alone cannot declare readiness.

The measured backend is qBittorrent v5.3.0 / WebAPI 2.16.2 / libtorrent 2.1.2.0, on Linux x64.
A private single-file v1 torrent plays through the existing browser/HLS path before completion.
Slow full-file gating, graceful partial restart and a POSIX generation/rename simulation pass.
The whole-file reference is still used by the experimental prefix poll and browser adapter.
A separate standalone feeder now validates each buffer against backend piece metadata without
accepting reference-file bytes; that is a bounded additional proof, not a finished runtime adapter.

## Options and weighted comparison

Weights are owner-accepted engineering priorities, not measured probabilities. Scores 0–5: 0 blocks,
5 is ideal. V identifies directly verified documentation/experiment facts; E identifies estimates.
A zero on the progressive-capability requirement excludes an option from satisfying that goal,
even when it remains useful as a fallback.

- A: qBittorrent HTTP control plus an owned generation cache and hash-verified buffer reader.
- B: a native libtorrent reader/service, with a new binding/service deployment boundary.
- C: SABnzbd completed-file integration first, without a demonstrated progressive reader.
- D: defer acquisition and keep existing completed-local-file playback only.

| Criterion | Weight | A | B | C | D |
|---|---:|---|---|---|---|
| Verified-read and generation contract | 30 | 3 E — hash reader measured; production admission/leases remain to implement | 5 V/E — native asynchronous piece reads documented; integration still unmeasured | 2 V/E — repair/unpack may precede media availability | 5 E — assumes immutable completed-file handoff; existing leases are not proven |
| Progressive capability and evidence — required | 20 | 5 V — real backend and browser fixture demonstrated | 4 V/E — native reads/deadlines exist; no project spike | 0 V — reviewed workflow does not establish this capability | 0 V — no pre-completion playback |
| Fit with the requested arr ecosystem | 20 | 5 V/E — existing client shape, HTTP adapter | 2 E — separate integration beside arr download control | 4 V — arr clients can use Usenet workflow | 1 V — no acquisition integration |
| Construction and maintenance effort | 15 | 4 E — extend existing protocol/file seams | 2 E — packaging, bindings and alert lifecycle added | 4 E — completed-file integration is simpler | 5 V — no new backend |
| Deployment/operational burden | 10 | 4 E — one planned client, shared private cache | 2 E — native component/service still to package on target | 4 E — one alternative client plus configured Usenet access | 5 V — unchanged deployment |
| Recovery evidence in this project | 5 | 4 V — graceful partial restart measured, crash not tested | 3 E — API primitives exist, project recovery unmeasured | 2 E — no project experiment | 1 V — no transfer recovery |
| Total weight | 100 | | | | |

| Weighted points | A | B | C | D |
|---|---:|---:|---:|---:|
| Verified read — 30 | 90 | 150 | 60 | 150 |
| Progressive — 20 | 100 | 80 | 0 | 0 |
| Ecosystem — 20 | 100 | 40 | 80 | 20 |
| Maintenance — 15 | 60 | 30 | 60 | 75 |
| Deployment — 10 | 40 | 20 | 40 | 50 |
| Recovery — 5 | 20 | 15 | 10 | 5 |
| Total /500 | **410** | **335** | **250 — excluded for progressive goal** | **300 — excluded for progressive goal** |

A leads eligible B by 75 points because the project has measured the existing HTTP/client path.
B exposes stronger native read primitives but adds an untested integration boundary. Sensitivity:
raise verified-read weight 30→60, scale every other weight by 40/70: A 362.86, B 405.71, C 228.57,
D 385.71 (C/D still excluded). Halve it 30→15, scale others by 85/70: A 433.57, B 299.64,
C 260.71, D 257.14. The recommendation is sensitive to how strongly the owner prioritizes native
read guarantees over ecosystem reuse; the owner accepted the current weights and A on 2026-11-13. Revisit the matrix if those priorities change.

B is the design fallback: activating it requires its own controlled spike, native/service interface,
packaging and recovery tests; it is not a configuration switch. C remains a separate completed-file
Usenet option, not a replacement for the progressive requirement.

## Accepted construction outcome and verified-read contract

Use A for initial construction, subject to this contract. Nothing enables partial-file production
playback or claims that current experiments implement the following entire runtime boundary:

1. Admit an authorized preparation bound to one authenticated fixed-destination backend identity,
   a validated **single-file v1** layout and an owned cache generation. A 40-character identifier
   alone does not establish protocol/layout. Hybrid/v2-only and multi-file layouts are outside this
   first progressive profile until separately specified and tested.
2. Validate file size, piece size, complete expected hash count, per-piece digest shape and partial
   final-piece length. Freeze a bounded copy of metadata for that identity. Unknown/malformed
   metadata prevents progressive admission. Current experiment bounds are 4 MiB per piece,
   65,536 hashes and 2 MiB per command response; the response cap can reject earlier than count.
   Align and approve runtime metadata/buffer/disk/session budgets in #311 before activation.
3. Treat downloaded-state telemetry only as permission to attempt a read. Read the **entire piece**
   through the confined local generation descriptor and compare its protocol digest to metadata.
   A short, not-yet-flushed, mismatching or unavailable piece yields bounded pending/failure and
   invalidates readiness as appropriate. No unknown byte is exposed as zero padding or final EOF.
4. Pass that exact validated private buffer, or its requested subrange, directly to the decoder.
   Do not validate a pathname and later reread unchecked bytes from it. Keep at most the admitted
   bounded working set. Single-file mapping avoids shared edge-piece offsets for the first profile.
5. Bind metadata, descriptors, queued buffers and sessions to one immutable cache-generation token.
   Do not allow arr import, replacement, deletion or in-place editing to redirect an active session.
   Defer disruptive handoff until readers close, or preserve the old generation and admit a new one.
   Device/inode/size/mtime in the rename experiment is not a production lease or content identity.
6. On restart, reauthenticate/reconcile identity and generation, revalidate metadata and future
   returned bytes; do not carry a stale positive readiness observation into a new session.
7. SHA-1 here is BitTorrent v1 integrity, not publisher authentication, title/language authenticity,
   malware safety or a substitute for confined FFmpeg input, authorization and media validation.
   The threat model must retain those separate controls.

Production readers will need bounded telemetry batching, cancellation, generation leases and
error classification. The experiment's per-piece HTTP requests are diagnostic overhead, not an
approved production polling policy. Indexer searches remain daily as specified in #310.

## Accepted candidate progressive media profile

| Boundary | Allowed for an initial candidate | Otherwise |
|---|---|---|
| Container | Validated front-indexed, unencrypted MP4 with necessary metadata available | Wait for full file and use supported existing complete-file path; invalid files fail |
| Video/audio pipeline | H.264 video and AAC required tracks through verified pipe → existing HLS path | Complete-file path until a different combination is specifically tested |
| Languages | Original and French audio identified and usable; original French can satisfy both | Not ready; another acceptable publication or wait/failure, never silently waive policy |
| French subtitles | Entire required cue set established before ready, parsed and usable by browser | Full-file preparation; a single early cue does not prove arbitrary-caption completeness |
| Partial direct play, seek, resume | Disabled unless the exact operation gains range/generation tests | Explicit bounded waiting/full-file path; do not serve holes |
| Unsupported torrent layout or verifier capability | No progressive admission | Complete verified file, or fail if integrity/readiness cannot be established |

This is an accepted design for a future allowlist, not a claim that arbitrary H.264 MP4 files currently work.
The only browser-caption proof remains the known early-caption fixture. Runtime caption admission
must be implemented before it can mark unknown titles ready. Full download is a prerequisite in
fallback cases, **not sufficient**: final media identity, required tracks/subtitles, authorization
and health checks still determine readiness. No fixed one-third threshold is adopted.

## Consequences and acceptance boundary

Accepted research outcome: **GO to construct A under this contract**, not production GO.
No new generic provider framework, hosted CI/review request, public tracker query, service install,
VPN change or Pi deployment is part of this decision.

Owner weight/contract validation is complete. Final publication/merge checks remain required before #308 closure.
Then #316 policy and #309 intent work can proceed in their dependency order; #311–#313 must implement
and test this contract before progressive activation. Actual arr import, arbitrary-title subtitle
admission, crash/blackhole resilience, full application capacity and Pi QA remain explicit runtime
or deployment work, not retroactive claims about these experiments.

## Source diversity and future backends

The owner explicitly requires avoiding dependence on one download source. Indexer, publication,
content provider/peer set and download client are separate identities. Choosing qBittorrent does
not select an exclusive indexer, tracker or publication source.

- #310 must support multiple configured indexers through Prowlarr, with bounded queries, candidate
  deduplication, compatible source selection and no blanket failure when one indexer is unavailable.
  Reuse the chosen Sonarr/Radarr discovery owner instead of adding a second indexer poller.
  Indexers can share upstream content; configuration/testing must not claim independence from count alone.
- Future #325 adds a second retrieval engine/protocol after the initial feature; SABnzbd/Usenet is
  a candidate, not already adopted or progressively validated. Full-file-only adapters stay usable
  through their declared capabilities, after repair/extraction and normal readiness checks.
- Wishlist, preparation and notification identities stay independent of vendor names. Persist a
  namespaced backend job reference and the selected source/content/generation. Add a small second
  adapter when needed; do not build an unused generic provider registry in the initial release.
- On an outage, reconcile any uncertain old submission before resubmitting elsewhere. A changed
  source/content creates a validated generation; active readers keep their bytes. No seamless splice,
  duplicate retrieval or notification is implied by future failover.
- Native libtorrent B is a read-architecture fallback. A secondary acquisition backend is a separate
  diversity feature, not an implicit switch to B or a claim of extra indexers by installing a client.

## Primary references

- [qBittorrent WebUI API 5.0 family](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29), consulted 2026-11-13 directly and via Context7; deployed API version measured separately.
- [BitTorrent v1 metadata and piece digests, BEP 3](https://www.bittorrent.org/beps/bep_0003.html), consulted 2026-11-13.
- [libtorrent asynchronous read/deadline API](https://libtorrent.org/reference-Torrent_Handle.html), documentation 2.1.0, consulted 2026-11-13; not a project runtime measurement.
- [SABnzbd post-processing workflow](https://sabnzbd.org/wiki/extra/job-options), consulted 2026-11-13; no project runtime measurement.
