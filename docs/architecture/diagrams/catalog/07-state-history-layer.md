# State diagram — a modal layer on the history stack

The lifecycle of one `<dialog>` layer (detail dialog, player, title sheet) under
`useHistoryLayer`.

> **Feature**: UC4 / UC5–UC7 / UC26 ([spec](../../specs/history-back.md))
> **Related ADRs**: ADR-0024

## Diagram

```mermaid
stateDiagram-v2
  [*] --> Waiting: mount [an own Back is on its way]
  [*] --> Entered: mount / pushState, or replaceState on an adoptable entry
  Waiting --> Entered: popstate [last own Back landed] / pushState
  Waiting --> [*]: unmount
  Entered --> Popped: popstate [landing depth < depth] / dialog.close()
  Entered --> Closed: close [button or Escape] / history.back() if it owns the top entry
  Entered --> HandedOff: unmount while open / entry adoptable
  Popped --> [*]: close / onClose (save, end session)
  Closed --> [*]: onClose
  HandedOff --> [*]
```

## Notes

- Several layers popped by one Back close top first (`closingOrder`).
- "Owns the top entry" counts the Backs still on their way (`ownsTop`).
