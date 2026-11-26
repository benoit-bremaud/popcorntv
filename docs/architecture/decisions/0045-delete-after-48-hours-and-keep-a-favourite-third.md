# ADR-0045 — Delete 48 h after the last playback, keep the first third of a favourite

- Status: accepted (owner framing 2026-11-23, #434; weights validated by the owner on 2026-11-26)
- Date: 2026-11-24
- Deciders: owner
- Related: REQ-46, REQ-51, REQ-52, [deletion activity](../diagrams/on-demand-retrieval/07-activity-deletion.md),
  [file lifecycle](../diagrams/on-demand-retrieval/05-state-retrieved-file.md); ADR-0043, ADR-0044; epic #160

## Context

A retrieved file must leave the disk soon after it is watched, yet a viewer who stops a film one
evening often resumes it the next day, and a favourite should start at once. The owner decided on
2026-11-23: deletion 48 h after the last playback, favourites per profile keep only the first third.
REQ-22 (no automatic deletion) is replaced.

## Options

- **A**: delete 48 h after the last playback; a favourite keeps its first third (owner).
- **B**: keep every file until disk pressure, then least recently played first.
- **C**: delete at player close, unless favourite (first third kept).
- **D**: keep every watched file (no deletion).

## Matrix

| # | Criterion | Weight | A | B | C | D |
|---|---|---|---|---|---|---|
| 1 | Disk economy | 30 | **4** E: at most 48 h of watched titles | **2** E: fills to the ceiling | **5** E: nothing kept after close | **0** E: the USB disk fills — blocks |
| 2 | Resume comfort (stop tonight, resume tomorrow) | 25 | **4** E: 48 h covers the next evening | **5** E: kept while space allows | **1** E: re-retrieved at every resume | **5** E |
| 3 | Favourite starts at once | 20 | **5** E: first third always on disk | **3** E: may be evicted | **5** E: first third kept | **5** E |
| 4 | Predictability for the household | 15 | **5** E: one fixed rule | **2** E: depends on other titles | **4** E: simple, but surprising on resume | **4** E |
| 5 | Simplicity | 10 | **3** E: timer and trim | **4** E: eviction only | **4** E: delete on close | **5** E |
|   | **Σ** | **100** | | | | |

| Points | A | B | C | D |
|---|---:|---:|---:|---:|
| 1 (30) | 120 | 60 | 150 | 0 |
| 2 (25) | 100 | 125 | 25 | 125 |
| 3 (20) | 100 | 60 | 100 | 100 |
| 4 (15) | 75 | 30 | 60 | 60 |
| 5 (10) | 30 | 40 | 40 | 50 |
| **Total / 500** | **425** 🏆 | **315** | **375** | **335 — eliminated (0 on disk)** |

Sensitivity: halving resume comfort (25 → 12.5, others × 87.5/75) gives A 429.2, C 420.8: A holds.
Doubling disk economy (30 → 60, others × 40/70) gives **C 428.6**, A 414.3: C would lead. A stands
at the owner's weights, which put resume comfort close to disk economy.

## Decision

**A.**

- 48 h counted from the last lease release, whether the film was finished or abandoned.
- A favourite (per profile, kept while at least one profile has it) keeps bytes 0 … size / 3,
  rounded up to whole verified pieces. Adding a favourite retrieves that third at once; after a
  playback the file is trimmed back to it 48 h after the last playback.
- Unplayed prefetch: purged 6 h after the last sheet opening.
- `MEDIA_ROOT` is never touched; a title being played is never deleted.
- The sweep runs on the serial timer every 15 min and at start-up.

## Fallback

**C** (375/500): delete at close. Activation cost: set the delay to 0; drop-in.

## Consequences

- Favourites belong to epic #160 for their UI; this ADR fixes their disk effect (slice 3).
- The statistics count the space saved by each deletion and trim (REQ-61).
