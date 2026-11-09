# ADR-0026 — Collapse duplicate titles in the web catalog

- Status: accepted (owner chose A in the #176 chat, 2026-11-09)
- Date: 2026-11-09
- Deciders: owner
- Related: spec [duplicate-titles](../specs/duplicate-titles.md), ADR-0004, ADR-0018, issue #176

## Context

The web catalog merges the media of every library (spec catalog-grid UC3 step 2). A film
present in two libraries shows two identical posters in every row (QA FON-11, 2026-11-08).

## Options

A — collapse in the web catalog: one card per title (`titleKey`), the libraries and a copy
picker in the detail dialog; B — keep both cards and label each with its library; C —
deduplicate on the server so the routes answer one copy.

| Criterion                              | Weight | A                                          | B                                       | C                                          |
| -------------------------------------- | -----: | ------------------------------------------ | --------------------------------------- | ------------------------------------------ |
| Viewer experience                      |     35 | 5 — one poster, libraries as a detail      | 2 — two posters, better told apart      | 4 — one poster, no choice of file          |
| Simplicity                             |     25 | 3 — one pure function, a select            | 5 — a caption                           | 2 — routes, contract and per-library reads |
| Consistent with identity (ADR-0018)    |     20 | 5 — same idea as the carry-over key        | 2 — Continue watching shows only one    | 4                                          |
| Regression risk                        |     20 | 3 — progress and mark must follow the copy | 5                                       | 2 — library management (#123) relies on per-library lists |
| **Total**                              |    100 | **410**                                    | **335**                                 | **310**                                    |

Sensitivity: B overtakes A only with simplicity at 55 or more.

## Decision

A. `titleKey` / `collapseCopies` in `apps/web/src/catalog/catalog.ts`; `loadCatalog`
returns `{ libraries, media }`; `DetailDialog` takes `copies`, `initialCopyId`,
`libraries`. The key stays in the web package: the server's `identityKeys` (ADR-0018) works
on the parsed title, which the `Media` contract does not carry.

## Consequences

- Series are not collapsed (spec R2).
- Two keys exist for "same title" (server carry-over, web collapse); they agree on the TMDB
  id and differ only for unmatched files.
