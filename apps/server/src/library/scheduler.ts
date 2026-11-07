import type { FastifyBaseLogger } from 'fastify';
import type { Library } from '@popcorntv/shared';
import { LibraryBusyError } from './lock.js';

/** What a scheduled scan run needs; `buildApp` wires the real ones, tests fakes. */
export interface ScanScheduleDeps {
  /** Minutes between two runs (spec scheduled-scan R1). */
  readonly intervalMin: number;
  readonly libraries: () => readonly Library[];
  /** The same lock-held scan + included enrichment as `POST /libraries/:id/scan`. */
  readonly scan: (library: Library) => Promise<unknown>;
  readonly logger: Pick<FastifyBaseLogger, 'info' | 'warn'>;
  /** Timer boundary, injected so tests drive time. */
  readonly setInterval?: (run: () => void, ms: number) => unknown;
  readonly clearInterval?: (handle: unknown) => void;
}

/** Rescans every library one after the other; a busy one is skipped, a failure only logged. */
export async function scanAllLibraries(deps: Omit<ScanScheduleDeps, 'intervalMin'>): Promise<void> {
  for (const library of deps.libraries()) {
    try {
      // One at a time on purpose: scans share the disk and ffprobe.
      await deps.scan(library); // NOSONAR
    } catch (error) {
      if (error instanceof LibraryBusyError) {
        deps.logger.info({ libraryId: library.id }, 'scheduled scan skipped: library busy');
      } else {
        deps.logger.warn({ err: error, libraryId: library.id }, 'scheduled scan failed');
      }
    }
  }
}

/**
 * UC1 on a timer (spec scheduled-scan, ADR-0016): every `intervalMin` minutes, unless the
 * previous run is still going. Returns the stop function.
 */
export function startScanSchedule(deps: ScanScheduleDeps): () => void {
  const set = deps.setInterval ?? ((run, ms) => globalThis.setInterval(run, ms).unref());
  const clear =
    deps.clearInterval ??
    ((handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>));
  let running = false;
  const handle = set(() => {
    if (running) return;
    running = true;
    void scanAllLibraries(deps)
      .catch((error: unknown) => deps.logger.warn({ err: error }, 'scheduled scan failed'))
      .finally(() => {
        running = false;
      });
  }, deps.intervalMin * 60_000);
  return () => clear(handle);
}
