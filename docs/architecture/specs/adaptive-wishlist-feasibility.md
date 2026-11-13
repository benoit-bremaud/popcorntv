# Adaptive wishlist — progressive recovery feasibility

Study and bounded experiments for #308, following the lifecycle dossier merged in PR #317.

## Status and evidence

This records bounded research experiments, not production adoption of a backend.
The owner authorized moving to #308 after merging #317. The owner accepted option A and the concrete stage-1 harness plan on 2026-11-12.
Stage-1 implementation was authorized first. The owner subsequently approved the isolated backend,
VPN and existing-player experiments; their execution evidence and remaining limits are linked below.

Observed locally on 2026-11-12: FFmpeg and ffprobe 8.0.1-3ubuntu2 are available. Neither
`qbittorrent` nor `qbittorrent-nox` resolves on PATH. This does not inventory Docker containers
or prove what is installed on the Pi. No public source, indexer, tracker or real title was queried.

Primary documentation consulted on 2026-11-12:
- [qBittorrent WebUI API 5.0+](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29), also queried through Context7's `/qbittorrent/wiki` index. This is a documented API family, not an observed installed version.
- [libtorrent torrent_handle API](https://libtorrent.org/reference-Torrent_Handle.html), current page identifies version 2.1.0. Compatibility with a particular qBittorrent build must be measured separately.
- [SABnzbd job options](https://sabnzbd.org/wiki/extra/job-options), protocol/product version not pinned by that page; runtime version is unobserved.

## Capability comparison

| Need | qBittorrent WebUI API | Native libtorrent | SABnzbd |
|---|---|---|---|
| Identity and telemetry | Torrent hash, per-file metadata, sizes, speed and state | Native handle/status and metadata | Download jobs and post-processing workflow; not assessed as a byte-range reader |
| Partial coverage | `pieceStates`, `piece_size`, per-file inclusive `piece_range` | Piece possession/read operations | No verified piece-to-media range contract established by reviewed job documentation |
| Scheduling | Sequential and first/last priority controls documented | Piece priorities/deadlines and asynchronous reads | Repair/unpack may still be required before a usable media file exists |
| Integration cost (estimate) | Server HTTP adapter and shared mounted cache | Native runtime/bindings or separate service | Fits completed-file acquisition, not proven progressive media |
| Blocking unknown | A downloaded-state observation is not documented as a stable external-file read lease | Must safely manage native IO, alerts and lifecycle | Media availability before repair/unpack not established |

The source distinction matters: libtorrent documents asynchronous cache flushing and reads.
We must not assume that WebUI `pieceStates == 2` alone guarantees bytes are already safely
readable through another process's file descriptor. A filesystem length or a preallocated file
is not independent evidence of verified coverage. Native read callbacks are asynchronous and
may complete out of order; native access is not automatically a simpler solution.

For multi-file torrents, inclusive piece indices alone do not provide a byte offset within a
shared first/last piece. The spike must obtain validated torrent layout metadata or restrict its
first protocol experiment explicitly to single-file torrents. It must never infer offsets from
rounded piece ranges or mix global torrent speed with one selected file's useful recovery rate.

## Accepted investigation direction

Scores are engineering judgments based on reviewed capabilities, not benchmark results.
Weights total 100. This decision selects what to investigate first, not what to deploy.

- A: investigate a bounded qBittorrent HTTP/file-boundary prototype.
- B: investigate a native libtorrent reader/service first.
- C: start with SABnzbd full-file recovery; progressive proof remains unresolved.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Usable coverage evidence | 30 | 4 — piece state and layout, external-read guarantee unproven | 5 — native completed-piece reads available | 2 — reviewed job lifecycle does not establish media ranges |
| Progressive control | 30 | 4 — sequential/edge priority, exact read scheduling unproven | 5 — piece deadlines and read alerts | 1 — archive/repair stage can precede usable media |
| Fit with the existing ecosystem | 25 | 5 — an existing planned download client with a server HTTP boundary | 2 — adds a separate native integration to the TypeScript stack | 4 — fits an alternative existing client, but only after unpack/repair |
| Bounded implementation effort | 15 | 4 — no SDK needed, protocol and file seam only | 2 — native packaging and alert/lifecycle responsibilities | 4 — complete-file handoff is simpler, progressive requirement unmet |
| Total | 100 | **425/500** | **380/500** | **250/500** |

A versus B: A reuses the planned download-client shape, while B exposes stronger native
read controls at a higher integration cost. The decisive risk for A is external-file read
correctness. Sensitivity: lowering A's coverage score from 4 to 2 drops A to 365, below B's
380. Therefore A is the proposed experiment, with a no-go if the read guarantee fails.
B is the design fallback, requiring a revised native/service boundary rather than a config
switch. C is a full-download safety path, not satisfaction of the progressive requirement.
The owner accepted the recommendation and stage-1 plan on 2026-11-12. This does not approve deployment or establish backend feasibility.

## Experiment stages and proposed files

### Stage 1 — deterministic local media mechanics

Proposed new files only, no production API or CI/CD edits:
- `scripts/progressive-playback-spike.mjs`: opt-in harness using Node's built-in modules and
  existing FFmpeg/ffprobe, with a fixed synthetic source and bounded temporary workspace.
- `scripts/progressive-playback-spike.test.mjs`: cheap unit cases for range/piece mapping,
  trace replay and failure classification (Node built-in runner, no package installation).
- `docs/architecture/qa/2026-11-12-issue-308-feasibility.md`: actual measurements and go/no-go
  evidence after execution, never fabricated in advance.

Generate a small synthetic video, two labeled synthetic audio tracks and a French subtitle
fixture locally. Synthetic language tags test selection/plumbing, not translation or linguistic
correctness. Exercise a front-indexed MP4 and a control with end metadata, plus unsupported
input fallback. Keep generated media outside Git. A deterministic local writer/reader provides
fast/slow/stalled and non-contiguous delivery traces. It must distinguish real EOF from missing
future bytes and compare decoded output with the complete reference.

This stage proves media/range mechanics only. It does not prove qBittorrent behavior, public
network performance, Sonarr import, Pi capacity or a universally playable format.

### Stage 2 — actual selected backend, isolated local content

Only after explicit approval of backend setup and experiment details:
- Record exact client, API, underlying library and operating-system versions.
- Use a separate disposable configuration and synthetic private local torrent with no public
  tracker, DHT, peer exchange, local-service discovery or real indexer access. Bound network
  access to the intended local peers; do not touch the user's existing client/configuration.
- Check downloaded pieces against the synthetic reference before exposing bytes. Verify what
  the WebUI state means at disk-read time, including incomplete final pieces and restart.
- Repeat fast/slow/interrupt/restart and cancellation cases with the real engine. A test double
  cannot be substituted for this evidence.
- If required software is unavailable, report blocked, propose the exact installation/container
  setup separately and obtain approval. Do not install or pull an unreviewed image here.

### Stage 3 — existing player and import boundaries

The owner authorized this stage on 2026-11-12 after the backend/VPN experiment. The concrete
next experiment uses the existing production web bundle, real Fastify routes/repositories
with an ephemeral SQLite database, a synthetic scanned library and Chromium. An experiment-only
adapter replaces the FFmpeg input boundary with a pipe of independently verified cache ranges;
it preserves the production HLS/audio arguments and confines the input to the synthetic fixture.
No production route, library, environment secret or deployed service is changed. This controlled
writer is not qBittorrent: the backend transfer evidence remains the separate stage-2 run.
The browser must decode real video before cache completion, select French audio through the
existing UI, receive real subtitle extraction, and release its session/processes on close.
Per-stage logs and measured limitations belong in a separate stage-3 report. Unsupported
resume/direct-file behavior must remain explicit rather than being silently enabled.

Feed verified local media into the same direct/HLS invariants as the application without
modifying a production library. Test delayed ranges, seeks, source failure and final completion.
A passing standalone decode does not prove browser playback: validate selected audio/subtitles
and buffering in the actual player path before claiming end-to-end support.

Sonarr/Radarr normally import completed downloads. A partial preparation stays in a separate
cache identity. Bind an active session to stable bytes; exercise a simulated completion/rename
without changing the content underneath it. Real *arr import behavior remains a separate
configured-service test if those services are not available in the isolated environment.

## Required acceptance observations

| Case | Necessary observation |
|---|---|
| Prefix versus scattered completion | Same percentage cannot make scattered/holey input ready |
| Container metadata | End metadata does not produce a false ready state |
| Fast recovery | Verified startup media reads/decodes while later pieces are still unavailable |
| Slow recovery | Policy chooses full-file preparation; no premature notice |
| Collapse/stall | Bounded wait and honest waiting/error, not false final EOF |
| Seek outside coverage | No holes served; explicit bounded pending behavior |
| Audio/subtitles | Required selected tracks and subtitles usable, missing ones prevent readiness |
| Restart/cancellation | No duplicate intent, leaked child process or stale readable generation |
| Completion/import | Existing reader keeps consistent bytes and identity |
| Resource use | Record actual cache/CPU/memory and concurrency, do not extrapolate laptop results to Pi |

## Combined backend/player experiment

The owner approved combining the real backend and player and requested early adversarial review.
The review identified telemetry-only coverage, destructive reuse of the controlled-writer setup,
subtitle cache invalidation by mtime, short-circuiting cleanup and swallowed pipe errors as blockers.
The combined experiment must address those before any positive claim.

The bounded-prefix probe was executed on the synthetic control: 64/128/256/384 KiB prefixes
all produced WebVTT equal to the complete control (exit 0 with partial-file stderr). This proves
only the fixture's complete single early cue, not arbitrary embedded subtitle completeness.

The independently reviewed comparison is:

| Criterion | Weight | A: immutable verified prefix + segment barrier | B: API warm-up without barrier |
|---|---:|---|---|
| Subtitle-before-frame evidence | 40 | 5: deterministic ordering | 2: autoplay race remains |
| Cleanup simplicity | 20 | 3: explicit cancellation needed | 4: fewer suspended responses |
| Real-code reuse | 25 | 5: existing routes and player | 4: API availability only |
| Bounded effort | 15 | 3: small additional mechanism | 4: simpler |
| Total /500 | 100 | **430** | **320** |

A is the investigation direction. Sensitivity: reducing its first score to 3 still gives 350,
above B's 320. Further analysis remains available. No production source mode is enabled.

Implementation sequence:

1. Advance backend verified coverage only after reading actual cache bytes against the known
   synthetic reference. Expose only a read-only source and bounded resume operation to a consumer
   outside the polling loop; propagate failures. The backend owns its containers and workspace.
2. Stop the real client at an incomplete prefix, await stopped state and read a private immutable
   caption snapshot from actual target bytes. The complete control is an assertion/metadata oracle,
   never the subtitle input. Resume only through the real client's API.
3. In external-source player mode, never copy, truncate or write the target. Check its inode/size/mtime
   across paused setup, scan using explicitly known control metadata and open the cache read-only.
4. Feed subtitle extraction from the bounded immutable snapshot through the same tracked process
   boundary. Compare the real subtitle API's entire VTT to the full-reference oracle before Play.
   Clear only the experiment-owned derived subtitle cache to prove subsequent loading does not
   depend on preserving mtime or reusing a stale cached response.
5. The experiment-only loopback transport holds HLS segments with a bounded abortable barrier until
   the browser has parsed the expected real text track. Release it only then, and observe the cue
   in activeCues at the first decoded video time within its 0–2 second window.
6. Observe both backend coverage and video-clock advancement while the target is still incomplete;
   retain independent disk evidence, normal-end checks, structured diagnostics and source ownership.
7. Attempt every cleanup; abort the barrier before server shutdown and retain private workspaces if
   reader/process closure cannot be confirmed. Add fault tests, then request adversarial rereview.

The full-file fallback remains mandatory whenever complete required captions cannot be established.
This controlled-fixture experiment cannot justify arbitrary-film subtitle readiness or deployment.

## Exit conditions

The #308 verdict is GO only for a measured backend/format/version combination that passes the
real-backend verified-range and playback scenarios. PARTIAL means bounded experimental evidence exists
but the required acceptance scenarios are not all proven. BLOCKED means a needed tool/setup/permission
is absent. NO-GO means the candidate violates a required invariant. None permits pretending
that full-file-only playback has fulfilled progressive playback.

Stages 1–3 now have bounded execution evidence: the [media mechanics report](../qa/2026-11-12-issue-308-feasibility.md),
[real backend/VPN report](../qa/2026-11-12-issue-308-backend-vpn.md) and
[existing-player report](../qa/2026-11-12-issue-308-player.md). The player decodes incomplete verified
input and reaches normal end in the controlled-writer experiment. Overall verdict remains PARTIAL:
the [combined report](../qa/2026-11-12-issue-308-combined.md) proves real-backend/browser playback
and an active French startup cue for the controlled fixture only. Real slow recovery, interruption
and restart during transfer, final rename/import identity, arbitrary-title caption readiness and
Pi performance remain unproven. These remaining cases prevent closing #308. The #307 local CI remains separate baseline evidence.
