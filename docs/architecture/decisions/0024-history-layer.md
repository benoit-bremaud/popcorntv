# ADR-0024 — Modal layers as history entries

- Status: accepted (brick #169, owner approval 2026-11-08)
- Date: 2026-11-08
- Deciders: owner
- Related: spec [history-back](../specs/history-back.md), ADR-0004, ADR-0005, ADR-0020,
  issue #169

## Context

The detail dialog, the player and the Discover title sheet are modal `<dialog>` elements
with no history entry: Back on a phone leaves the app instead of closing them. A reload
must land on the catalog, and the auth links already use the URL hash.

## Options

A — `history.pushState` with a `{ pctvLayer }` state per open layer, `popstate` closes it;
B — a hash route per layer (`#/media/:id`);
C — a router library (react-router).

| Criterion                                | Weight | A                     | B                              | C                     |
| ---------------------------------------- | -----: | --------------------- | ------------------------------ | --------------------- |
| Simplicity (KISS)                        |     30 | 4 — one hook          | 3 — parse and sync the hash    | 1 — routing overhaul  |
| Reload lands on the catalog              |     25 | 5 — state, not URL    | 2 — the hash reopens the title | 3                     |
| No clash with the auth hash links        |     20 | 5                     | 1                              | 4                     |
| Nesting and the Discover hand-off        |     15 | 4 — depth + adoption  | 3                              | 4                     |
| Dependencies                             |     10 | 5                     | 5                              | 1                     |
| **Total /500**                           |    100 | **455**               | **255**                        | **255**               |

Sensitivity: with simplicity at 10 and dependencies at 30, A 475, B 295, C 255; A stays
first. B and C tie at 255.

## Decision

A. Each layer pushes its entry on open; `popstate` below its depth closes it through the
dialog's `close`; a close by button or Escape calls `history.back()` when its entry is on
top. A layer unmounted while open leaves its entry adoptable by the next layer. A layer
opened while such a Back is pending waits for its `popstate`. One module `popstate`
listener closes the layers above the landing entry, top first, so the player saves and ends
its session before the detail dialog closes.

## Consequences

- Deep links to a title stay out of scope (no URL per title).
- The Back counter is module state: one app per page, reset in tests.
