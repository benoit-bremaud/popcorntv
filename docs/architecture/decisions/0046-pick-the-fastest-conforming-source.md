# ADR-0046 — Pick the fastest conforming source, play a degraded one only by choice

- Status: accepted (owner framing 2026-11-23, #434; weights validated by the owner on 2026-11-26)
- Date: 2026-11-24
- Deciders: owner
- Related: REQ-54, REQ-55, [spec](../specs/on-demand-retrieval.md) § 7; ADR-0028, ADR-0034, ADR-0043; issue #186

## Context

A title may have several versions (sources) of different quality, languages, subtitles and speed.
The owner decided on 2026-11-23: default 720p (owner MCDA 425/500 against 1080p H.264 415/500),
higher on the profile's choice; target original audio, French audio and French subtitles; a
non-conforming version is shown as degraded and played only knowingly. Sources may contain only
video and subtitle files. REQ-24 ("not ready without both audios and subtitles") becomes a target
with an informed exception.

## Options

- **A**: fastest conforming version automatically; degraded versions only on explicit choice (owner).
- **B**: highest-quality conforming version, regardless of speed.
- **C**: first version found.
- **D**: fastest version of any kind, degraded accepted automatically.

## Matrix

| # | Criterion | Weight | A | B | C | D |
|---|---|---|---|---|---|---|
| 1 | Start time | 30 | **5** E: speed is the first sort key | **2** E: larger files, often slower | **2** E: speed ignored | **5** E |
| 2 | Conformity (VO, VF, FR subtitles, quality) | 25 | **5** E: guaranteed or announced | **5** E | **2** E: by chance | **1** E: silently degraded |
| 3 | Honesty and choice for the viewer | 20 | **5** E: verdict and reasons shown, "Other versions" | **4** E: shown, but no speed trade-off | **2** E | **1** E: no choice |
| 4 | Disk and bandwidth | 15 | **4** E: 720p default | **2** E: largest files | **3** E | **4** E |
| 5 | Simplicity | 10 | **3** E: verdict plus sort | **4** E | **5** E | **4** E |
|   | **Σ** | **100** | | | | |

| Points | A | B | C | D |
|---|---:|---:|---:|---:|
| 1 (30) | 150 | 60 | 60 | 150 |
| 2 (25) | 125 | 125 | 50 | 25 |
| 3 (20) | 100 | 80 | 40 | 20 |
| 4 (15) | 60 | 30 | 45 | 60 |
| 5 (10) | 30 | 40 | 50 | 40 |
| **Total / 500** | **465** 🏆 | **335** | **245** | **295** |

Sensitivity: halving start time (30 → 15, others × 85/70) gives A 457.5, B 363.9: A holds.

## Decision

**A.**

1. Reject a source whole if it holds any file other than video or subtitle files; probe every file
   with `localInputArgs` (ADR-0028); execute nothing.
2. Verdict per version: resolution ≥ profile quality (720p default), original audio, French audio,
   French subtitles (embedded or an external subtitle file, #186). Each missing item is a reason.
3. Sort conforming versions by measured speed, then peers; pick the first.
4. No conforming version: list degraded ones, fastest first, with reasons; play one only on choice.
5. The profile's default audio language selects the audio track (ADR-0019 kept).

## Fallback

**B** (335/500): sort by quality first. Activation cost: change the sort key; drop-in.

## Consequences

- One pure function `versionVerdict` in `packages/shared`.
- The degraded badge on cards (REQ-62) and the "Other versions" menu come from the verdict.
