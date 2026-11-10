/** Timer boundary, injected so tests drive time. */
export interface TimerFns {
  readonly setInterval?: (run: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/**
 * Runs `run` every `intervalMin` minutes on an unref-ed timer, never two at once (ADR-0016
 * pattern, shared by the scheduled scan and the wishlist check). `run` gets a `stopped` probe
 * to end early; a rejection goes to `onError`. Returns the stop function, which resolves once
 * the run in flight has returned.
 */
export function startSerialTimer(
  intervalMin: number,
  run: (stopped: () => boolean) => Promise<void>,
  onError: (error: unknown) => void,
  timer: TimerFns = {},
): () => Promise<void> {
  const set = timer.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms).unref());
  const clear =
    timer.clearInterval ??
    ((handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>));
  let stopped = false;
  let running: Promise<void> | null = null;
  const handle = set(() => {
    if (running || stopped) return;
    running = run(() => stopped)
      // log: n/a — onError is the caller's logger (`library.schedule.failed`, `wishlist.check.failed`)
      .catch(onError)
      .finally(() => {
        running = null;
      });
  }, intervalMin * 60_000);
  return async () => {
    stopped = true;
    clear(handle);
    await running;
  };
}
