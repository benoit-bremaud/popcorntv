import { describe, expect, it, vi } from 'vitest';
import type { Library } from '@popcorntv/shared';
import { LibraryBusyError } from './lock.js';
import { scanAllLibraries, startScanSchedule } from './scheduler.js';

const library = (id: string): Library => ({
  id,
  name: id,
  rootPath: `/media/${id}`,
  kind: 'films',
});

function logger() {
  return { info: vi.fn(), warn: vi.fn() };
}

describe('scanAllLibraries', () => {
  it('should scan every library in turn, skipping a busy one and logging a failure', async () => {
    const log = logger();
    const scan = vi.fn(async (lib: Library) => {
      if (lib.id === 'b') throw new LibraryBusyError('b');
      if (lib.id === 'c') throw new Error('root gone');
    });

    await scanAllLibraries({
      libraries: () => [library('a'), library('b'), library('c'), library('d')],
      scan,
      logger: log,
    });

    expect(scan.mock.calls.map(([lib]) => lib.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(log.info).toHaveBeenCalledWith(
      { libraryId: 'b' },
      'scheduled scan skipped: library busy',
    );
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});

describe('startScanSchedule', () => {
  it('should run on the interval, never overlap, and stop', async () => {
    let tick: () => void = () => undefined;
    const setInterval = vi.fn((run: () => void) => {
      tick = run;
      return 'handle';
    });
    const clearInterval = vi.fn();
    let release: () => void = () => undefined;
    const scan = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const stop = startScanSchedule({
      intervalMin: 15,
      libraries: () => [library('a')],
      scan,
      logger: logger(),
      setInterval,
      clearInterval,
    });
    tick();
    tick();
    release();
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1));
    // Let the run's catch / finally settle and clear the guard.
    await new Promise((resolve) => setTimeout(resolve, 0));
    tick();
    stop();

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 15 * 60_000);
    await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(2));
    expect(clearInterval).toHaveBeenCalledWith('handle');
  });

  it('should log, not throw, when the library list cannot be read', async () => {
    let tick: () => void = () => undefined;
    const log = logger();
    startScanSchedule({
      intervalMin: 15,
      libraries: () => {
        throw new Error('database is locked');
      },
      scan: vi.fn(),
      logger: log,
      setInterval: (run: () => void) => {
        tick = run;
        return 'handle';
      },
      clearInterval: vi.fn(),
    });

    tick();

    await vi.waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith(expect.anything(), 'scheduled scan failed'),
    );
  });

  it('should use real, unref-ed timers by default', () => {
    const stop = startScanSchedule({
      intervalMin: 1,
      libraries: () => [],
      scan: vi.fn(),
      logger: logger(),
    });

    expect(() => stop()).not.toThrow();
  });
});
