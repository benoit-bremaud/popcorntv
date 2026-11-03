import { describe, expect, it, vi } from 'vitest';
import { installShutdownHandlers, type ShutdownProcess } from './shutdown.js';

function setup(close: () => Promise<unknown> = () => Promise.resolve()) {
  const listeners = new Map<string, (reason?: unknown) => void>();
  const proc: ShutdownProcess = {
    once: (event, listener) => listeners.set(event, listener),
    exit: vi.fn(),
  };
  const app = { close: vi.fn(close), log: { error: vi.fn() } };
  installShutdownHandlers(app, proc);
  const emit = async (event: string, reason?: unknown): Promise<void> => {
    listeners.get(event)?.(reason);
    await vi.waitFor(() => expect(proc.exit).toHaveBeenCalled());
  };
  return { app, proc, emit };
}

describe('installShutdownHandlers', () => {
  it.each(['SIGINT', 'SIGTERM'])('closes the app and exits 0 on %s', async (signal) => {
    const { app, proc, emit } = setup();
    await emit(signal);
    expect(app.close).toHaveBeenCalledOnce();
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it.each(['uncaughtException', 'unhandledRejection'])(
    'logs, closes the app and exits 1 on %s',
    async (event) => {
      const { app, proc, emit } = setup();
      const error = new Error('boom');
      await emit(event, error);
      expect(app.log.error).toHaveBeenCalledWith(error, expect.stringContaining(event));
      expect(app.close).toHaveBeenCalledOnce();
      expect(proc.exit).toHaveBeenCalledWith(1);
    },
  );

  it('logs and still exits when closing the app fails', async () => {
    const failure = new Error('close failed');
    const { app, proc, emit } = setup(() => Promise.reject(failure));
    await emit('SIGTERM');
    expect(app.log.error).toHaveBeenCalledWith(failure, 'closing the app failed');
    expect(proc.exit).toHaveBeenCalledWith(0);
  });

  it('closes only once when a crash follows a signal', async () => {
    const { app, proc, emit } = setup();
    await emit('SIGTERM');
    await emit('uncaughtException', new Error('late'));
    expect(app.close).toHaveBeenCalledOnce();
    expect(proc.exit).toHaveBeenCalledOnce();
  });
});
