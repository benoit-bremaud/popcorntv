# Local review — notification panel dismissal

Escape closes the notification panel and returns focus to the bell. An outside
pointer press closes the panel while leaving focus with the pointer target.

- Scope: #295, notification panel event handling and tests.
- Baseline: the Escape and outside pointer regressions failed on `7a48d0f`.
- Focus protection: Escape remains available to an open modal. The closed panel
  does not listen for dismissal gestures.
- Local verification: 494 web tests and the web type check passed. The component
  tests cover Escape, focus restoration, pointer press, and modal priority.
- Pi staging verification: pending deployment.
