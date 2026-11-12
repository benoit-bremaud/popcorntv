# Adaptive wishlist — progressive recovery feasibility

Initial study and proposed experiment for #308, following the lifecycle dossier merged in PR #317.

## Status and evidence

This is a research/experiment plan, not proof of progressive playback or adoption of a backend.
The owner authorized moving to #308 after merging #317. Runtime/harness implementation and
backend installation remain subject to the concrete plan and protocol choice below.

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

## Proposed prototype decision

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
Weights, choice and concrete implementation plan await owner validation.

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

## Exit conditions

The #308 verdict is GO only for a measured backend/format/version combination that passes the
real-backend verified-range and playback scenarios. PARTIAL means stage-1 mechanics passed
but backend/player integration is not proven. BLOCKED means a needed tool/setup/permission
is absent. NO-GO means the candidate violates a required invariant. None permits pretending
that full-file-only playback has fulfilled progressive playback.

No runtime prototype, backend experiment or test has been executed for #308 in this study.
The #307 local CI and production-build smoke are baseline validation, not evidence for #308.
