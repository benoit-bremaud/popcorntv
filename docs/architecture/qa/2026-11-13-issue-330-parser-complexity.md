# Parser separator cleanup — complexity and preservation

Issue #330 replaces repeated suffix retries while preserving the existing public filename parser contract.

## Reachability and limits

The production calls to `parseMediaName` and `isExtra` are in `LibraryScanner`; parsing follows
filesystem traversal and path confinement. The scan HTTP route is owner-only; it accepts a
library identity, not arbitrary parser text. `clean` receives a file stem, series-folder name,
title prefix or edition label, rather than the whole relative path. Component limits depend
on the actual media filesystem. `getconf` on this checkout reports NAME_MAX255/PATH_MAX4096;
that does not establish every library/Pi filesystem's limits. The pure parser itself has no
application length cap, and no new limit is introduced.

The old `/[\s-]+$/` search can retry at successive starts when a long hyphen run ends in a
nonmatching character. Initial characterization on the actual baseline parser confirmed
rapid growth on synthetic oversized names. This supports a bounded maintenance fix, not a
claim of remote exploitability or a demonstrated production denial of service. Measurements
on large synthetic inputs must not be presented as typical filesystem scan latency.

## Decision and preservation argument

The first two existing global normalizations are unchanged. After `\s+` is collapsed, every
removable whitespace character is an ASCII space. The new loop decreases one suffix index
while it sees space or ASCII hyphen, slices once and retains the original final `trim()`.
Each suffix position is visited at most once. This replaces retrying suffix search with a
linear bounded pass and preserves the exact earlier matched suffix, including all-separator
and empty cases. Prefix/interior hyphens, non-ECMAScript whitespace and surrogate code units
are preserved. The scanner and all other parser expressions are unchanged; no whole-parser
linear-time guarantee is claimed.

Options: A backward suffix scan; B forward scan remembering the last nonseparator; C enforce
an artificial input cap while keeping the regex. Scores are engineering judgments,0–5;
weights sum100. C violates the unchanged parser contract and is excluded.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Bounded suffix work | 35 | 5 — one decreasing index | 5 — one increasing index | 5 — bounded only by rejection/truncation |
| Exact existing semantics, required | 30 | 5 — same suffix after unchanged normalization | 5 — last nonseparator yields same cut | 0 — changes accepted inputs/results |
| Small change / maintenance | 20 | 5 — replaces one suffix operation | 4 — tracks state across entire string | 3 — adds an input policy |
| Work when suffix is short | 10 | 5 — inspects suffix only | 3 — scans the full normalized prefix | 5 — short capped input |
| Verification | 5 | 5 — literal cases and frozen-parser differential oracle | 5 — same verification possible | 4 — needs new rejection policy cases |
| Total /500 | 100 | **500** | **460** | **305 — excluded** |

Weighted points: A175+150+100+50+25=500; B175+150+80+30+25=460;
C175+0+60+50+20=305. Scores reflect this narrow implementation context, not benchmarks.

A wins by40. Sensitivity: short-suffix weight10→0, others×100/90 gives A500/B477.78/C283.33;
weight10→20, others×80/90 gives A500/B442.22/C326.67. A remains first. B is a valid but larger
alternative if a future caller needs a forward traversal; no fallback framework is added.
This is the small equivalent linear replacement already authorized by #330, not a new feature.

## Tests and reproducible evidence

[TC-01–08](cases/330-parser-separator-scan.md) map to literal public parser assertions in
`apps/server/src/library/name-parser.test.ts` and the deterministic differential harness
`scripts/benchmark-name-parser.mjs`. The136-test parser/library targeted suite passed after
the change; final consolidated evidence is recorded in review-local on the frozen head.

The harness transpiles the actual committed baseline/current standalone parser modules with
the installed TypeScript compiler; it does not copy or mock their cleanup implementation.
Baseline is fixed at `5bfeffb187dff309a56b37487748396627feaddf`. It compares complete parse
objects over exhaustive short punctuation/Unicode combinations plus explicit metadata cases,
then checks every timed fixture for parity. Existing dedicated `isExtra` tests remain in the
application suite rather than being redundantly repeated for every generated case.

Run from a clean committed checkout with existing dependencies:

```sh
node scripts/benchmark-name-parser.mjs --verify-only
node scripts/benchmark-name-parser.mjs > /tmp/parser-benchmark.json
```

No fetch/install/network is performed. The fixed baseline commit must be available locally.
The harness writes only its private temporary module directory and cleans it in `finally`.
Each measurement uses five single-call samples and reports the median. Timed and warm-up
results contribute to an observable checksum outside the timed interval. No duration or speedup
threshold is asserted in unit tests. Timings are runtime/machine observations; correctness is
the deterministic deep-equality check. Source/runtime fingerprints accompany the artifact.

## Independent review

The test-plan audit found no Must and two Should items, both addressed: consume benchmark
results and distinguish U+0085 from ECMAScript U+FEFF. A redundant extra-classification sweep
was removed. Final test pertinence and code reviews follow the implementation. No production
logging is added to a pure parser hot path; benchmark diagnostics contain synthetic lengths
and measurements, never private filenames or credentials.
