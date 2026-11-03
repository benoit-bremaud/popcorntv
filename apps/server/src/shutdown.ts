/** The slice of the app the shutdown needs: its onClose hook kills every FFmpeg child. */
export interface Closable {
  close(): Promise<unknown>;
  readonly log: { error(payload: unknown, message: string): void };
}

/** The slice of `process` the shutdown listens on, injected by the tests. */
export interface ShutdownProcess {
  once(event: string, listener: (reason?: unknown) => void): unknown;
  exit(code: number): void;
}

/**
 * Closes the app, so no FFmpeg child outlives it, on Ctrl-C / `docker stop` (exit 0) and on
 * a crash from an uncaught exception or unhandled rejection (logged, exit 1).
 */
export function installShutdownHandlers(app: Closable, proc: ShutdownProcess): void {
  let closing = false;
  const shutdown = async (code: number): Promise<void> => {
    if (closing) return;
    closing = true;
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
      app.log.error(reason, `${event}: closing sessions before exit`);
      void shutdown(1);
    });
  }
}
