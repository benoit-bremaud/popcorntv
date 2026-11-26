# ADR-0043 — Start playback from a sheet prefetch

- Status: accepted (owner framing 2026-11-23, #434); revises ADR-0034 (readiness model only)
- Date: 2026-11-24
- Deciders: owner
- Related: [requirements](../../requirements/08-on-demand-retrieval.md), [spec](../specs/on-demand-retrieval.md),
  ADR-0034, ADR-0044, ADR-0045; epic #306, issues #310–#315, #328

## Context

Epic #306 was designed to search every wished title daily and prepare it fully in the background,
then notify "ready" (UC32, REQ-11, REQ-15, REQ-20, ADR-0034 milestone "complete file first").
On 2026-11-23 the owner rejected that model: it fills the Pi's USB disk with titles nobody may
watch. The owner wants the disk to hold a title only while someone is about to watch it, is
watching it, or keeps it as a favourite, and wants the start to be as fast as possible.

## Options

- **A**: background preparation of every wish (the previous design).
- **B**: on-demand prefetch when the sheet opens, progressive playback, stop at player close.
- **C**: retrieve only when Play is pressed, no prefetch.
- **D**: retrieve the complete file on demand, then play.

## Matrix (0 blocks … 5 ideal; V verified, E estimate)

| # | Criterion | Weight | A | B | C | D |
|---|---|---|---|---|---|---|
| 1 | Instant start | 30 | **5** E: file already there | **4** E: ≤ 3 s once the button is full (NFR-16) | **2** E: ≤ 30 s at each Play at ≥ 20 Mb/s | **1** E: minutes to hours |
| 2 | Disk economy | 25 | **1** V: every wish stored | **4** E: start buffers capped, purge 6 h | **5** E: only what is watched | **4** E: whole file, only for watched titles |
| 3 | Fit with the owner's vision (2026-11-23) | 20 | **1** V: rejected | **5** V: the framing itself | **3** V: no filling button | **1** V: no progressive playback |
| 4 | Construction cost (reuse of #310/#311/#328) | 15 | **4** E: branches exist | **3** E: new scheduler, cache and VPN reused | **4** E: same minus prefetch | **4** E: complete-file path only |
| 5 | Egress volume and exposure | 10 | **1** E: retrieves unwatched titles | **4** E: prefetch of opened sheets | **5** E: watched titles only | **4** E: watched titles only |
|   | **Σ** | **100** | | | | |

| Points | A | B | C | D |
|---|---:|---:|---:|---:|
| 1 (30) | 150 | 120 | 60 | 30 |
| 2 (25) | 25 | 100 | 125 | 100 |
| 3 (20) | 20 | 100 | 60 | 20 |
| 4 (15) | 60 | 45 | 60 | 60 |
| 5 (10) | 10 | 40 | 50 | 40 |
| **Total / 500** | **265** | **405** 🏆 | **355** | **250** |

Sensitivity: doubling disk economy (25 → 50, others × 50/75) gives B 403.3, C 403.3 (tie), A 210,
D 300: B and C tie when disk economy weighs half of the total. The owner set
"start as fast as possible" as the goal, so the weights stand.

## Decision

**B.** Opening a sheet prefetches the start buffer (ADR-0044); the Play button fills; playback is
progressive; closing the player stops the retrieval; deletion follows (ADR-0045).

Changes to ADR-0034:

- **Kept**: qBittorrent as first engine, the verified-read contract (items 1–7), source diversity,
  the candidate progressive media profile as the allowlist for the progressive path.
- **Replaced**: the "complete file first" milestone (#314 A, #315 A), the background "ready" state
  and its notification, the full-file-only latch from sustained speed (REQ-15): the start buffer
  formula absorbs slow sources and says so on the sheet.
- A complete file still plays through the existing complete-file path once fully verified
  (REQ-16 kept).

## Fallback

**C** (355/500): drop the prefetch and retrieve at Play. Activation cost: remove the sheet trigger;
the scheduler, cache and playback path stay. Drop-in.

## Consequences

- No "ready" notification: notifications announce that a source appeared (REQ-45).
- The scheduler needs priorities (playback > early click > favourite > prefetch > search).
- Issues #310–#315 are re-planned around slice 1 (films); #314 A and #315 A disappear.
