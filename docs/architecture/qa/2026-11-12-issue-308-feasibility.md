# Issue #308 — deterministic progressive media experiment

The first-stage local mechanics experiment passed; the backend/player feasibility verdict remains **PARTIAL**.

## Scope and reproduction

Branch `test/308-adaptive-wishlist-feasibility`, harness introduced in `d980a22`.
The owner accepted the recommended qBittorrent-first investigation and the concrete stage-1 plan.
No qBittorrent instance, public source, tracker, indexer or VPN was used. No production API or
library was modified. The harness uses Node built-ins plus the existing FFmpeg/ffprobe binaries.

```sh
node scripts/progressive-playback-spike.test.mjs
node scripts/progressive-playback-spike.mjs --run
```

Use Node 22 or later with FFmpeg/ffprobe available on PATH. Without `--run`, the harness prints
usage and exits before generating media. It creates a bounded synthetic fixture under the OS
temporary directory and removes its own workspace in `finally`; permanent media is not accessed.

The unit file also supports `node --test scripts/progressive-playback-spike.test.mjs`. Direct
execution was used for readable per-case TAP output because this machine's subprocess runner
summarizes child output at file level.

## Observed environment

- Node v22.23.4, Linux x64.
- FFmpeg and ffprobe 8.0.1-3ubuntu2.
- Synthetic 320×180 H.264 MP4, six seconds, **312,655 bytes**.
- Two synthetic AAC tracks tagged `eng`/`fra`, one subtitle tagged `fra`. Tags test plumbing;
  the generated sine waves are not evidence of spoken-language accuracy.
- No qBittorrent executable on PATH and no matching local download-client Docker image found.
  This is not an inventory of services on the Pi.

## Results

| Case | Observation | Verdict |
|---|---|---|
| Fast controlled delivery | First video frame at **753 ms**, with **114,688 of 312,655 bytes** verified; transfer still incomplete. Complete delivery/decode finished at 2,131 ms. | PASS, local pipe mechanics |
| Slow controlled delivery | Full-file mode selected; first frame at **12,712 ms**, with all 312,655 bytes verified. Finished at 12,777 ms. | PASS, illustrative trace classification |
| Video and two audio tracks | All decoded frame/sample checksums equal the complete-reference output in both runs. | PASS |
| French subtitle extraction | Stream extraction equals the complete reference and includes the expected synthetic caption. | PASS |
| Preallocated missing content | An empty verified prefix produces a bounded timeout and no read of the preallocated hole. | PASS |
| Decoder starvation | A stalled feeder reaches its watchdog, FFmpeg is killed and its close is awaited. | PASS |
| End-indexed MP4 | Top-level box inspection rejects progressive eligibility when `mdat` precedes `moov`. | PASS, classification only |
| Unit scenarios | **12 passed, 0 failed**: piece holes, file offsets/final pieces, malformed layouts, trace thresholds, bounded/cancelled reads, invalid ranges, short reads, metadata structure and seeks outside coverage. | PASS |
| Formatting and targeted lint | Both new scripts formatted with Prettier; ESLint passed. | PASS |

The [machine-readable observation](2026-11-12-issue-308-feasibility.json) preserves the measured
values. Timings depend on the host and scheduling; correctness is asserted by byte/frame and
state conditions rather than these wall-clock numbers.

## What the experiment does and does not prove

The producer preallocates the full file, writes chunks, reads them back against the synthetic
reference and only then advances its verified prefix. The decoder receives bounded verified
ranges through stdin. This proves that our controlled reader can withhold missing bytes and
feed decodable beginning data before completion; **it does not prove that qBittorrent's reported
piece state is a safe external-file read guarantee**.

Fast/slow rates are controlled input traces (three times and half the fixture's average byte
rate). The 1.5 ratio in `traceMode` is an experiment selector, not the production readiness
policy. No stable-bandwidth estimator, variable-bitrate forecast or real-time playback guarantee
is established. FFmpeg decodes as data arrives; the browser's playback clock is not exercised.

End-metadata handling is inspected as a safety prerequisite, not demonstrated as a passing
partial decode. Unknown/unsupported layouts fail classification. HLS, browser buffering,
actual backend restart, *arr import/rename and Pi resource/concurrency limits are **not tested**.
The twelve unit tests are opt-in script tests, not silently added to the workspace test command.
A full workspace CI rerun was not performed for this isolated harness stage.

## Next gate

Subsequent owner-authorized stage-2 execution validated a real isolated qBittorrent transfer,
disk visibility, completion and restart after completion. A separate NordVPN namespace
experiment also passed bounded connection/stop/recovery checks. See the
[backend/VPN report](2026-11-12-issue-308-backend-vpn.md) for measurements and remaining gaps.
Cancellation and mid-transfer restart still need evidence; stage 3 must exercise the actual
player/HLS path. Keep #308 open: **PARTIAL**, not GO.

## VPN requirement raised during the experiment

The owner asked whether download traffic can use Tailscale or the existing NordVPN account.
Documented facts: Tailscale's default overlay does not reroute public Internet traffic; an exit
node supplies the egress location. Gluetun documents NordVPN support and shared container
networking. This suggests a bounded download-client network namespace behind a NordVPN tunnel,
with Tailscale retained for private app access. It is a proposed deployment design, not configured
or accepted here.

Before any Internet-facing acquisition, prove that traffic and DNS cannot fall back to the host
route during tunnel failure, reconnection and container restart. Keep only narrowly required
local control-plane access, and verify the download client's actual public egress, not the host's.
No VPN credentials should enter the repository, logs or chat. Protocol choice and image/digest
pinning belong to the concrete isolated deployment plan; no host-wide route is changed here.

Sources checked on 2026-11-12: [Tailscale exit nodes](https://tailscale.com/docs/features/exit-nodes),
[Gluetun NordVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/nordvpn.md),
[shared container network](https://github.com/qdm12/gluetun-wiki/blob/main/setup/connect-a-container-to-gluetun.md),
[firewall options](https://github.com/qdm12/gluetun-wiki/blob/main/setup/options/firewall.md).
