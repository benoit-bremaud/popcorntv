import { describe, expect, it } from 'vitest';
import { Argon2Hasher, HasherBusyError } from './hasher.js';

describe('Argon2Hasher', () => {
  it('hashes with argon2id, 19 MiB, 2 passes, 1 lane, and verifies', async () => {
    const hasher = new Argon2Hasher();

    const stored = await hasher.hash('correct horse battery');

    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(stored, 'correct horse battery')).toBe(true);
    expect(await hasher.verify(stored, 'correct horse batterY')).toBe(false);
  });

  it('salts every hash', async () => {
    const hasher = new Argon2Hasher();

    expect(await hasher.hash('same password!')).not.toBe(await hasher.hash('same password!'));
  });

  it('answers false for an unknown user after checking a dummy hash', async () => {
    expect(await new Argon2Hasher().verify(null, 'popcorntv-dummy-password')).toBe(false);
  });

  it('queues work past the concurrency cap and runs it once a slot frees', async () => {
    const hasher = new Argon2Hasher({ maxConcurrent: 1, waitMs: 10_000 });

    const results = await Promise.all([hasher.hash('first password'), hasher.hash('second one!')]);

    expect(results).toHaveLength(2);
  });

  it('gives up with HasherBusyError when no slot frees in time', async () => {
    const hasher = new Argon2Hasher({ maxConcurrent: 1, waitMs: 1 });

    const [first, second] = await Promise.allSettled([
      hasher.hash('first password'),
      hasher.hash('second one!'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second).toMatchObject({ status: 'rejected', reason: expect.any(HasherBusyError) });
    // The slot of the timed-out waiter was not leaked.
    await expect(hasher.hash('third password')).resolves.toMatch(/^\$argon2id\$/);
  });

  it('computes the dummy hash again after a busy failure', async () => {
    const hasher = new Argon2Hasher({ maxConcurrent: 1, waitMs: 1 });

    const [, busy] = await Promise.allSettled([
      hasher.hash('first password'),
      hasher.verify(null, 'any password!'),
    ]);

    expect(busy).toMatchObject({ status: 'rejected', reason: expect.any(HasherBusyError) });
    await expect(hasher.verify(null, 'any password!')).resolves.toBe(false);
  });
});
