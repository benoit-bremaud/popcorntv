import { describe, expect, it } from 'vitest';
import { LoginLimiter } from './limiter.js';

const MINUTE = 60_000;

function failTimes(limiter: LoginLimiter, n: number, ip: string, key: string | null, now = 0) {
  for (let i = 0; i < n; i += 1) limiter.fail(ip, key, now);
}

describe('LoginLimiter', () => {
  it('refuses the 6th try of a pair for the rest of the 15-minute window', () => {
    const limiter = new LoginLimiter();
    failTimes(limiter, 4, '1.1.1.1', 'owner');

    expect(limiter.check('1.1.1.1', 'owner', 0)).toEqual({ allowed: true });
    limiter.fail('1.1.1.1', 'owner', 0);
    expect(limiter.check('1.1.1.1', 'owner', 5 * MINUTE)).toEqual({
      allowed: false,
      retryAfterSec: 600,
      firstRefusal: true,
    });
    expect(limiter.check('1.1.1.1', 'owner', 15 * MINUTE)).toEqual({ allowed: true });
  });

  it('flags only the first refusal of a window', () => {
    const limiter = new LoginLimiter();
    failTimes(limiter, 5, 'ip', 'owner');

    expect(limiter.check('ip', 'owner', 0)).toMatchObject({ firstRefusal: true });
    expect(limiter.check('ip', 'owner', 0)).toMatchObject({ firstRefusal: false });
  });

  it('treats an existing and an unknown username alike: the key is what was typed', () => {
    const limiter = new LoginLimiter();
    failTimes(limiter, 5, 'ip', 'owner');
    failTimes(limiter, 5, 'ip', 'nobody-here');

    expect(limiter.check('ip', 'owner', 0)).toMatchObject({ allowed: false });
    expect(limiter.check('ip', 'nobody-here', 0)).toMatchObject({ allowed: false });
  });

  it('keeps the owner able to sign in from another address while a stranger is locked', () => {
    const limiter = new LoginLimiter();
    failTimes(limiter, 5, 'stranger', 'owner');

    expect(limiter.check('home', 'owner', 0)).toEqual({ allowed: true });
  });

  it('caps one address at 30 failures across usernames and routes', () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 29; i += 1) limiter.fail('ip', `user${i}`, 0);
    expect(limiter.check('ip', 'fresh', 0)).toEqual({ allowed: true });

    limiter.fail('ip', null, 0);

    expect(limiter.check('ip', 'fresh', 0)).toMatchObject({ allowed: false });
    expect(limiter.check('ip', null, 0)).toMatchObject({ allowed: false });
  });

  it('clears the pair on success but not the address count', () => {
    const limiter = new LoginLimiter({ ipLimit: 6 });
    failTimes(limiter, 5, 'ip', 'owner');

    limiter.succeed('ip', 'owner');

    expect(limiter.check('ip', 'owner', 0)).toEqual({ allowed: true });
    limiter.fail('ip', 'owner', 0);
    expect(limiter.check('ip', 'owner', 0)).toMatchObject({ allowed: false });
  });

  it('sweeps expired windows once many keys are tracked', () => {
    const limiter = new LoginLimiter({ windowMs: 1_000 });
    for (let i = 0; i < 5_000; i += 1) limiter.fail(`ip${i}`, `u${i}`, 0);

    limiter.fail('late', 'owner', 2_000);

    expect(limiter.check('ip1', 'u1', 2_000)).toEqual({ allowed: true });
    expect(limiter.check('late', 'owner', 2_000)).toEqual({ allowed: true });
  });
});
