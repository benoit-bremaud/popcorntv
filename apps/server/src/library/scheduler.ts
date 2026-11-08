import type { FastifyBaseLogger } from 'fastify';
import type { Library, ScanReport } from '@popcorntv/shared';
import { LibraryBusyError } from './lock.js';

/** What a scheduled scan run needs; `buildApp` wires the real ones, tests fakes. */
export interface ScanScheduleDeps {
  /** Minutes between two runs (spec scheduled-scan R1). */
  readonly intervalMin: number;
  readonly libraries: () => readonly Library[];
  /** The same lock-held scan + included enrichment as `POST /libraries/:id/scan`. */
  readonly scan: (library: Library) => Promise<ScanReport>;
  readonly logger: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  /** Timer boundary, injected so tests drive time. */
  readonly setInterval?: (run: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/**
 * Rescans every library one after the other; a busy one is skipped, a failure only logged.
 * Before each scan the list is read again, so a library deleted meanwhile is not scanned,
 * and `stopped` is checked so a closing server starts no further scan.
 */
export async function scanAllLibraries(
  deps: Omit<ScanScheduleDeps, 'intervalMin'>,
  stopped: () => boolean = () => false,
): Promise<void> {
  for (const library of deps.libraries()) {
    if (stopped()) return;
    if (!deps.libraries().some((current) => current.id === library.id)) continue;
    try {
      // One at a time on purpose: scans share the disk and ffprobe.
      const report = await deps.scan(library); // NOSONAR
      deps.logger.info(
        {
          libraryId: library.id,
          added: report.added,
          updated: report.updated,
          removed: report.removed,
          skipped: report.skipped.length,
          event: 'library.schedule.done',
        },
        'scheduled scan done',
      );
    } catch (error) {
      if (error instanceof LibraryBusyError) {
        deps.logger.info(
          { event: 'library.schedule.busy', libraryId: library.id },
          'scheduled scan skipped: library busy',
        );
      } else {
        deps.logger.warn(
          { event: 'library.schedule.failed', err: error, libraryId: library.id },
          'scheduled scan failed',
        );
      }
    }
  }
}

/**
 * UC1 on a timer (spec scheduled-scan, ADR-0016): every `intervalMin` minutes, unless the
 * previous run is still going. Returns the stop function, which resolves once the run in
 * flight (if any) has finished its current library.
 */
export function startScanSchedule(deps: ScanScheduleDeps): () => Promise<void> {
  const set = deps.setInterval ?? ((run, ms) => globalThis.setInterval(run, ms).unref());
  const clear =
    deps.clearInterval ??
    ((handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>));
  let stopped = false;
  let running: Promise<void> | null = null;
  const handle = set(() => {
    if (running || stopped) return;
    running = scanAllLibraries(deps, () => stopped)
      .catch((error: unknown) =>
        deps.logger.warn({ event: 'library.schedule.failed', err: error }, 'scheduled scan failed'),
      )
      .finally(() => {
        running = null;
      });
  }, deps.intervalMin * 60_000);
  return async () => {
    stopped = true;
    clear(handle);
    await running;
  };
}
