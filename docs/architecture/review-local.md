# Local review — #135 search titles and people

Pre-push review of `feat/135-search-titles-people`, 2026-11-07: one Sonnet general-purpose review (design, docs, tests, security); the Opus adversarial review runs once at the end of the #134–#136 stack (owner rule 2026-11-07).

## Findings

| # | Level | Finding | Outcome |
|---|---|---|---|
| 1 | Should | Result count not announced to screen readers | Fixed: visually hidden `<output>` with the count, spec R3 |
| 2 | Should | `byTitle.includes` makes the person pass O(n²) | Fixed: a `Set` of title matches |
| 3 | Should | Spec R3 "A–Z" did not name the collation | Fixed: `localeCompare`, browser locale |
| 4 | Should | Search state across a dialog open and close | No change: the query lives in `CatalogPage`, which stays mounted |
| 5 | Should | UC24 `include` UC4 questioned | No change: same pattern as UC22, opening a result is the goal's step |
| 6 | Nice | Escape during IME composition clears the field | Fixed: `isComposing` guard |
| 7 | Nice | R5 was a task note | Fixed: removed from the spec |
| 8 | Nice | Extra tests (whitespace query, multi-word, accented names) | Deferred |

No Must. No security finding: React escapes the query and cast names; nothing leaves the browser.
