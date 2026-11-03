/** The slice of the app the shutdown needs: its preClose hook kills every FFmpeg child. */
export interface ShutdownTarget {
  close(): Promise<unknown>;
  readonly log: { error(payload: unknown, message: string): void };
}

/** The slice of `process` the shutdown listens on, injected by the tests. */
export interface ShutdownProcess {
  once(event: string, listener: (reason?: unknown) => void): unknown;
  exit(code: number): void;
}

/** Past this delay the process exits even if open responses still hold `close()`. */
export const SHUTDOWN_DEADLINE_MS = 10_000;

/**
 * Closes the app, so no FFmpeg child outlives it, on Ctrl-C / `docker stop` (exit 0) and on
 * a crash from an uncaught exception or unhandled rejection (logged, exit 1): after a crash
 * the process state is unknown, so it must not keep serving. The first event wins; later
 * ones are only logged. The process exits even if `close()` fails or outlasts the deadline.
 */
export function installShutdownHandlers(app: ShutdownTarget, proc: ShutdownProcess): void {
  let closing = false;
  const shutdown = async (code: number): Promise<void> => {
    if (closing) return;
    closing = true;
    setTimeout(() => proc.exit(code), SHUTDOWN_DEADLINE_MS).unref();
    try {
      await app.close();
    } catch (error) {
      app.log.error(error, 'closing the app failed');
    } finally {
      proc.exit(code);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM']) {
    proc.once(signal, () => void shutdown(0));
  }
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    proc.once(event, (reason) => {
      app.log.error(reason, closing ? `${event} during shutdown` : `${event}: closing the app`);
      void shutdown(1);
    });
  }
}
