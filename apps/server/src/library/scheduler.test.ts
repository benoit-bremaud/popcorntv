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

const report = { added: 1, updated: 0, removed: 0, skipped: [], metadata: null };

describe('scanAllLibraries', () => {
  it('should scan every library in turn, skipping a busy one and logging a failure', async () => {
    const log = logger();
    const scan = vi.fn(async (lib: Library) => {
      if (lib.id === 'b') throw new LibraryBusyError('b');
      if (lib.id === 'c') throw new Error('root gone');
      return report;
    });

    await scanAllLibraries({
      libraries: () => [library('a'), library('b'), library('c'), library('d')],
      scan,
      logger: log,
    });

    expect(scan.mock.calls.map(([lib]) => lib.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(log.info).toHaveBeenCalledWith(
      { event: 'library.schedule.busy', libraryId: 'b' },
      'scheduled scan skipped: library busy',
    );
    expect(log.info).toHaveBeenCalledWith(
      {
        event: 'library.schedule.done',
        libraryId: 'a',
        added: 1,
        updated: 0,
        removed: 0,
        skipped: 0,
      },
      'scheduled scan done',
    );
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('should not scan a library deleted while the run was going', async () => {
    let list = [library('a'), library('b')];
    const scan = vi.fn<(lib: Library) => Promise<typeof report>>(async () => {
      list = [library('a')];
      return report;
    });

    await scanAllLibraries({ libraries: () => list, scan, logger: logger() });

    expect(scan.mock.calls.map(([lib]) => lib.id)).toEqual(['a']);
  });
});

describe('startScanSchedule', () => {
  function manualTimer() {
    const timer = {
      tick: (): void => undefined,
      setInterval: vi.fn((run: () => void) => {
        timer.tick = run;
        return 'handle';
      }),
      clearInterval: vi.fn(),
    };
    return timer;
  }

  function deferredScan() {
    const releases: Array<() => void> = [];
    const scan = vi.fn<(lib: Library) => Promise<typeof report>>(
      () =>
        new Promise<typeof report>((resolve) => {
          releases.push(() => resolve(report));
        }),
    );
    return { scan, release: () => releases.shift()?.() };
  }

  it('should run on the interval and never start a run while one is going', async () => {
    const timer = manualTimer();
    const { scan, release } = deferredScan();
    startScanSchedule({
      intervalMin: 15,
      libraries: () => [library('a')],
      scan,
      logger: logger(),
      ...timer,
    });

    timer.tick();
    timer.tick();
    expect(scan).toHaveBeenCalledTimes(1);

    release();
    await vi.waitFor(() => {
      timer.tick();
      expect(scan).toHaveBeenCalledTimes(2);
    });
    expect(timer.setInterval).toHaveBeenCalledWith(expect.any(Function), 15 * 60_000);
  });

  it('should clear the timer on stop and never run afterwards', async () => {
    const timer = manualTimer();
    const scan = vi.fn(async () => report);
    const stop = startScanSchedule({
      intervalMin: 15,
      libraries: () => [library('a')],
      scan,
      logger: logger(),
      ...timer,
    });

    await stop();
    timer.tick();

    expect(timer.clearInterval).toHaveBeenCalledWith('handle');
    expect(scan).not.toHaveBeenCalled();
  });

  it('should wait for the run in flight on stop and start no further library', async () => {
    const timer = manualTimer();
    const { scan, release } = deferredScan();
    const stop = startScanSchedule({
      intervalMin: 15,
      libraries: () => [library('a'), library('b')],
      scan,
      logger: logger(),
      ...timer,
    });
    timer.tick();

    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stopping;

    expect(scan.mock.calls.map(([lib]) => lib.id)).toEqual(['a']);
  });

  it('should log, not throw, when the library list cannot be read, then run again', async () => {
    const timer = manualTimer();
    const log = logger();
    let fail = true;
    const scan = vi.fn(async () => report);
    startScanSchedule({
      intervalMin: 15,
      libraries: () => {
        if (fail) throw new Error('database is locked');
        return [library('a')];
      },
      scan,
      logger: log,
      ...timer,
    });

    timer.tick();
    await vi.waitFor(() =>
      expect(log.warn).toHaveBeenCalledWith(expect.anything(), 'scheduled scan failed'),
    );
    fail = false;
    await vi.waitFor(() => {
      timer.tick();
      expect(scan).toHaveBeenCalledTimes(1);
    });
  });

  it('should use a real, unref-ed timer by default', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    const stop = startScanSchedule({
      intervalMin: 1,
      libraries: () => [],
      scan: vi.fn(),
      logger: logger(),
    });

    try {
      const handle = spy.mock.results[0]?.value as ReturnType<typeof globalThis.setInterval>;
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      expect(handle.hasRef()).toBe(false);
    } finally {
      await stop();
      spy.mockRestore();
    }
  });
});
