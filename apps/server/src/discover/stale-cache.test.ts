import { describe, expect, it, vi } from 'vitest';
import { StaleCache } from './stale-cache.js';

function setup(ttl = 10, max = 2) {
  let clock = 0;
  const cache = new StaleCache<string>(ttl, max, () => clock);
  return { cache, advance: (ms: number) => (clock += ms) };
}

const ignore = (): void => undefined;

describe('StaleCache', () => {
  it('loads a miss once and serves the fresh value without calling again', async () => {
    const { cache } = setup();
    const load = vi.fn(async () => 'a');

    expect(await cache.get('k', load, ignore)).toBe('a');
    expect(await cache.get('k', load, ignore)).toBe('a');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one call between concurrent misses', async () => {
    const { cache } = setup();
    const load = vi.fn(async () => 'a');

    await Promise.all([cache.get('k', load, ignore), cache.get('k', load, ignore)]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves a stale value at once and refreshes it behind, one call at a time', async () => {
    const { cache, advance } = setup();
    await cache.get('k', async () => 'old', ignore);
    advance(10);
    const load = vi.fn(async () => 'new');

    const [first, second] = await Promise.all([
      cache.get('k', load, ignore),
      cache.get('k', load, ignore),
    ]);
    await Promise.resolve();

    expect([first, second]).toEqual(['old', 'old']);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await cache.get('k', load, ignore)).toBe('new');
  });

  it('keeps the old value and reports a failed refresh', async () => {
    const { cache, advance } = setup();
    await cache.get('k', async () => 'old', ignore);
    advance(10);
    const onError = vi.fn();

    expect(await cache.get('k', async () => Promise.reject(new Error('down')), onError)).toBe(
      'old',
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(onError).toHaveBeenCalledWith(new Error('down'));
    expect(await cache.get('k', async () => 'never', ignore)).toBe('old');
  });

  it('rejects a miss whose load fails and caches nothing', async () => {
    const { cache } = setup();

    await expect(
      cache.get('k', async () => Promise.reject(new Error('x')), ignore),
    ).rejects.toThrow('x');
    expect(await cache.get('k', async () => 'b', ignore)).toBe('b');
  });

  it('forgets the least recently read key past the cap', async () => {
    const { cache } = setup(10, 2);
    await cache.get('a', async () => 'a', ignore);
    await cache.get('b', async () => 'b', ignore);
    await cache.get('a', async () => 'unused', ignore); // Touches a: b is now oldest.
    await cache.get('c', async () => 'c', ignore);
    const reload = vi.fn(async () => 'b2');

    expect(await cache.get('a', async () => 'a2', ignore)).toBe('a');
    expect(await cache.get('b', reload, ignore)).toBe('b2');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
