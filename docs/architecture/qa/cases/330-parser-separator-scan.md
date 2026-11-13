# Test cases — trailing separator cleanup

Issue #330 preserves the filename parser contract while removing repeated suffix retries; cases are designed before the implementation change.

## Cases

Risks are qualitative descriptions, not invented test-plan IDs. Public parser tests use real
pure functions with literal expected outputs; no filesystem, clock or domain mocks are needed.

| ID | Technique | Source | Risk | Input / steps | Expected result | Level | Test |
|---|---|---|---|---|---|---|---|
| TC-01 | Happy / EP | #330, library-scan naming contract | Changed title | Ordinary title, mixed dots/underscores and trailing ASCII hyphens | Same normalized title, year and metadata | Unit | Planned |
| TC-02 | BVA | #330 | Off-by-one trim | Zero/one/many trailing spaces/hyphens, leading and interior hyphens | Remove only the suffix; preserve prefix/interior punctuation | Unit | Planned |
| TC-03 | EP / Unicode | #330 | Overbroad Unicode cleanup | Every ECMAScript whitespace character around trailing separators | Normalize whitespace and preserve original results | Unit | Planned |
| TC-04 | Sad / EP | #330 | Accidental character loss | En/em dash, zero-width space, U+0085 and unpaired surrogate; contrast U+FEFF | Preserve nonmatching characters; no throw; keep legacy ECMAScript whitespace semantics | Unit | Planned |
| TC-05 | Edge / fallback | #330 | Empty name changes | Empty path and separator-only stems | Existing raw-stem fallback and unknown/film kind unchanged | Unit | Existing plus planned |
| TC-06 | Integration within parser | #330 | Metadata loss | Edition label, provider tags and series folder | Title cleanup leaves edition/provider/episode facts unchanged | Unit | Existing plus planned |
| TC-07 | Equivalence | #330 | Missed combinations | Exhaustive short alphabet across real baseline/current public parser APIs | Every complete parse object identical; dedicated existing extra-classification tests retained | Deterministic standalone harness | benchmark-name-parser.mjs --verify-only |
| TC-08 | Stress / measurement | #330 | Quadratic suffix retries | Matching and nonmatching hyphen runs at fixed bounded sizes | Equal parse output; reproducible separate timing evidence, no flaky unit timing limit | Benchmark | benchmark-name-parser.mjs |

## Scope and open limits

The current production caller is the filesystem scanner, not an arbitrary-text HTTP parse
endpoint. Filesystem component limits depend on the actual media filesystem; the repository
filesystem reports NAME_MAX255/PATH_MAX4096, which is not a universal media/Pi guarantee.
Oversized benchmark strings diagnose algorithmic growth and are not proof of a remotely
reachable denial-of-service vulnerability. The fix adds no artificial parser input limit.

Performance evidence must identify exact baseline/current source hashes and runtime. Verify
semantic parity before timing, keep bounded synthetic fixtures and clean only owned temporary
files. Benchmark medians are measurements, not release thresholds or scanner throughput claims.
