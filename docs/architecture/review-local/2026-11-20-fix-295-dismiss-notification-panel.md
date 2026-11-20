# Local review — notification panel dismissal

Escape closes the notification panel and returns focus to the bell when the
panel had focus. An outside pointer press closes it with normal focus handling.

- Scope: #295, notification panel event handling and tests.
- Baseline: the Escape and outside pointer regressions failed on `7a48d0f`.
- Focus protection: Escape remains available to an open modal. The closed panel
  does not listen for dismissal gestures. Escape from a focused control outside
  the panel leaves that control focused.
- Local verification: the component tests cover Escape, focus restoration,
  outside focus, pointer press, listener cleanup and modal priority.
- Pi staging verification: pending deployment.
