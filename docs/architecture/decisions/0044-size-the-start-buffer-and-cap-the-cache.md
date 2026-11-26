# ADR-0044 — Size the start buffer from speed and bitrate, cap the cache below the free space

- Status: accepted (owner, 2026-11-24, #434)
- Date: 2026-11-24
- Deciders: owner
- Related: [spec](../specs/on-demand-retrieval.md) § 3 and § 6, REQ-47, REQ-53, NFR-16; ADR-0043

## Context

The owner asked for a "smart" per-title cache computed from download speed and bitrate, plus a
global safety ceiling. The Pi's USB disk is shared with other applications and its size may change.
Two choices follow: when is the Play button full, and how large may the whole cache grow.

## Decision 1 — start buffer

Options:

- **A**: fixed 60 s of verified media.
- **B**: the no-stall need (30 s if S ≥ m·R, else 30 s + remaining duration × (1 − S/(m·R))), uncapped.
- **C**: B with a 30 s floor and a per-title cap of min(1 GiB, 10 % of the file); at the cap the
  button is full and the sheet says "playback may pause".

| # | Criterion | Weight | A | B | C |
|---|---|---|---|---|---|
| 1 | Start without a stall | 30 | **2** E: stalls as soon as S < R | **5** E: no stall by construction | **4** E: no stall unless the source is slow, then announced |
| 2 | Disk economy (opened, unplayed sheets) | 20 | **5** E: about 30 MB per title | **2** E: up to nearly the whole file | **4** E: 1 GiB at most |
| 3 | Time to a full button | 20 | **5** E: seconds | **2** E: minutes on a slow source | **4** E: bounded by the cap |
| 4 | Simplicity and testability | 15 | **5** V: one constant | **3** E: pure function on measurements | **3** E: same plus one bound |
| 5 | Honesty to the viewer | 15 | **2** E: a full button can still stall | **4** E: a full button keeps its promise | **5** E: promise kept or risk shown |
|   | **Σ** | **100** | | | |

| Points | A | B | C |
|---|---:|---:|---:|
| 1 (30) | 60 | 150 | 120 |
| 2 (20) | 100 | 40 | 80 |
| 3 (20) | 100 | 40 | 80 |
| 4 (15) | 75 | 45 | 45 |
| 5 (15) | 30 | 60 | 75 |
| **Total / 500** | **365** | **335** | **400** 🏆 |

Sensitivity: doubling "start without a stall" (30 → 60, others × 40/70) gives **B 405.7**, C 400,
A 294.3: B would lead by 5.7 points. Halving it (30 → 15, others × 85/70) gives A 400.4, C 400.0,
B 299.6: A would lead by 0.4, a tie in practice. C wins only at the validated weights; the decision is sensitive to
this one weight, which the owner validated on 2026-11-24.

**Decision: C.** Fallback **B** (335/500 at the validated weights, first under a heavier stall
weight): remove the cap. Activation cost: one setting; drop-in.

`m` (1.25), 1 GiB and 10 % are estimates, exposed as settings and measured by the owner on staging
(NFR-16).

## Decision 2 — global ceiling

Options:

- **A**: a fixed value in GiB set in the administration (100 GiB by default).
- **B**: 50 % of the volume's free space, recomputed continuously.
- **C**: min(owner value, free space − 15 % of the volume), owner value 100 GiB by default.

| # | Criterion | Weight | A | B | C |
|---|---|---|---|---|---|
| 1 | Never fill the shared USB disk | 35 | **2** E: a fixed value can exceed the free space | **4** E: follows the free space | **5** E: reserve guaranteed |
| 2 | Owner control and predictability | 20 | **5** E: one number | **2** E: moves with other apps | **4** E: the set number stays the maximum |
| 3 | Adapts to an unknown disk size | 15 | **1** E: manual | **5** E: automatic | **4** E: automatic under the set value |
| 4 | Simplicity and testability | 15 | **5** E | **3** E: depends on free space at the moment | **3** E: a min() of two values |
| 5 | Legibility in the statistics | 15 | **5** E | **2** E: the limit moves | **4** E |
|   | **Σ** | **100** | | | |

| Points | A | B | C |
|---|---:|---:|---:|
| 1 (35) | 70 | 140 | 175 |
| 2 (20) | 100 | 40 | 80 |
| 3 (15) | 15 | 75 | 60 |
| 4 (15) | 75 | 45 | 45 |
| 5 (15) | 75 | 30 | 60 |
| **Total / 500** | **335** | **330** | **420** 🏆 |

Sensitivity: halving "never fill the disk" (35 → 17.5, others × 82.5/65) gives C 398.5, A 371.3,
B 311.2: C holds.

**Decision: C.** Fallback **A** (335/500): drop the free-space term. Activation cost: one setting;
drop-in, at the risk of filling the disk.

## Eviction order (owner decision 2026-11-23)

Unplayed prefetches (oldest sheet opening first), then titles awaiting their 48 h (oldest last
playback first), then refuse new prefetches. Favourite thirds and titles being played are never
evicted. See the [disk pressure activity](../diagrams/on-demand-retrieval/07-activity-disk-pressure.md).

## Consequences

- One pure function `startBufferTarget` in `packages/shared`, tested with deterministic traces.
- The ceiling is recomputed before each reservation; the free space is read from the cache volume
  only.
