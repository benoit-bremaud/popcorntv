/**
 * A bounded in-memory cache serving a stale value while one call refreshes it (ADR-0027
 * pattern, spec where-to-watch R3). Concurrent misses of a key share the call in flight; past
 * `maxEntries`, the least recently read key is forgotten first.
 */
export class StaleCache<T> {
  private readonly entries = new Map<string, { readonly at: number; readonly value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number,
  ) {}

  /**
   * The cached value of `key`, refreshed behind the answer when older than `ttlMs`; a miss
   * waits for `load`. A failed refresh goes to `onRefreshError` and the old value stays.
   */
  async get(
    key: string,
    load: () => Promise<T>,
    onRefreshError: (error: unknown) => void,
  ): Promise<T> {
    const hit = this.entries.get(key);
    if (hit === undefined) return this.load(key, load);
    // Re-inserted last: recently read keys are kept longest.
    this.entries.delete(key);
    this.entries.set(key, hit);
    if (this.now() - hit.at >= this.ttlMs && !this.inFlight.has(key)) {
      // log: n/a — onRefreshError is the caller's logger (discover.providers.refresh_failed)
      this.load(key, load).catch(onRefreshError);
    }
    return hit.value;
  }

  /** Loads `key` now (a warm-up or a miss); concurrent loads of a key share one call. */
  load(key: string, load: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key);
    if (pending !== undefined) return pending;
    const call = (async () => {
      try {
        const value = await load();
        this.entries.delete(key);
        this.entries.set(key, { at: this.now(), value });
        if (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next().value;
          if (oldest !== undefined) this.entries.delete(oldest);
        }
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, call);
    return call;
  }
}
