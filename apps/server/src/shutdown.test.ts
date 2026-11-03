import { afterEach, describe, expect, it, vi } from 'vitest';
import { installShutdownHandlers, SHUTDOWN_DEADLINE_MS, type ShutdownProcess } from './shutdown.js';

function setup(close: () => Promise<unknown> = () => Promise.resolve()) {
  const listeners = new Map<string, (reason?: unknown) => void>();
  const proc: ShutdownProcess = {
    once: (event, listener) => listeners.set(event, listener),
    exit: vi.fn(),
  };
  const app = { close: vi.fn(close), log: { error: vi.fn() } };
  installShutdownHandlers(app, proc);
  const emit = (event: string, reason?: unknown): void => {
    const listener = listeners.get(event);
    if (!listener) throw new Error(`no handler for ${event}`);
    listener(reason);
  };
  return { app, proc, emit };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('installShutdownHandlers', () => {
  it.each(['SIGINT', 'SIGTERM'])('closes the app and exits 0 on %s', async (signal) => {
    const { app, proc, emit } = setup();

    emit(signal);

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
    expect(app.close).toHaveBeenCalledOnce();
  });

  it.each(['uncaughtException', 'unhandledRejection'])(
    'logs, closes the app and exits 1 on %s',
    async (event) => {
      const { app, proc, emit } = setup();
      const error = new Error('boom');

      emit(event, error);

      await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(1));
      expect(app.log.error).toHaveBeenCalledWith(error, `${event}: closing the app`);
      expect(app.close).toHaveBeenCalledOnce();
    },
  );

  it('logs and still exits when closing the app fails', async () => {
    const failure = new Error('close failed');
    const { app, proc, emit } = setup(() => Promise.reject(failure));

    emit('SIGTERM');

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalledWith(0));
    expect(app.log.error).toHaveBeenCalledWith(failure, 'closing the app failed');
  });

  it('closes only once when a crash arrives while closing', async () => {
    let finishClose = (): void => undefined;
    const { app, proc, emit } = setup(
      () => new Promise<void>((resolve) => (finishClose = resolve)),
    );
    const late = new Error('late');

    emit('SIGTERM');
    emit('uncaughtException', late);
    finishClose();

    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled());
    expect(app.close).toHaveBeenCalledOnce();
    expect(proc.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(app.log.error).toHaveBeenCalledWith(late, 'uncaughtException during shutdown');
  });

  it('exits at the deadline when close() never settles', () => {
    vi.useFakeTimers();
    const { proc, emit } = setup(() => new Promise<void>(() => undefined));

    emit('uncaughtException', new Error('boom'));
    vi.advanceTimersByTime(SHUTDOWN_DEADLINE_MS);

    expect(proc.exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
