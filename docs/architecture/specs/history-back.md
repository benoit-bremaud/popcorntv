# Back closes the open layer

The browser Back (the phone's Back gesture) closes the detail dialog, the player or the
Discover title sheet instead of leaving PopCornTV.

> **Feature**: Catalog, Playback, Discover — [catalog use cases](../diagrams/catalog/01-use-case.md)
> **Issue**: #169 · **Related ADRs**: ADR-0024, ADR-0004, ADR-0005, ADR-0020
> Format: requirements list (a cross-cutting behaviour of UC4, UC5–UC7 and UC26, no new use case).

## 1. Requirements

- **R1** Opening a layer (detail dialog, player, title sheet) adds one history entry whose
  state is `{ pctvLayer: n }`, `n` its depth: 1 above the catalog, 2 for the player opened
  from the detail dialog. The URL does not change.
- **R2** Back closes the top layer through its own `close` path (position saved, HLS
  session ended, focus returned), never the page. Back from the player closes the player
  only; a second Back closes the detail dialog. A Back over several entries at once closes
  every layer above the entry it lands on, top first (the player saves and ends its session
  before the detail dialog closes). Forward reopens nothing: landing on an entry no layer
  owns goes straight back over it.
- **R3** A close by the close button or Escape goes back over the layer's entry, so no stale
  entry stays: the next Back after it does what it would have done before the layer opened.
  Closes in a row count the Backs still on their way (player then detail, Escape twice).
- **R4** A layer opened again before that Back has landed waits for it, then takes its own
  entry: the landing Back never closes it.
- **R5** "Play in my library" (UC26) unmounts the title sheet without closing it; the
  detail dialog it opens reuses the sheet's entry (`replaceState`), so Back from it returns
  to the catalog, not to an empty entry. If the title cannot be opened, the entry stays
  and the next Back does nothing visible (one press, accepted).
- **R6** A reload on a layer entry shows the catalog: at start, `history.go(-n)` leaves it.

- **Known limit** A sign-out (401) while a layer is open unmounts it without a close: its
  entries stay and one Back press after the next sign-in may do nothing visible.

## 2. Design

One hook, `useHistoryLayer(ref)` in `apps/web/src/history-layer.ts`, called by each
`<dialog>` layer; its decisions are the pure `layerDepth`, `openLayer` and `poppedBy`
and `closingOrder` / `ownsTop` (ADR-0024). `leaveStaleLayers` runs in `main.tsx` before the
first render. Lifecycle: [state diagram](../diagrams/catalog/07-state-history-layer.md);
module: [component diagram](../diagrams/catalog/03-component.md).
