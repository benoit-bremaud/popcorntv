/** Failure counter of one key inside its window. */
interface Window {
  count: number;
  readonly startedAt: number;
  /** The first refusal of this window was already logged (spec auth R9). */
  refusalLogged: boolean;
}

/** Answer of `check`: allowed, or refused with the seconds to wait. */
export type LimitCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSec: number; readonly firstRefusal: boolean };

export interface LimiterOptions {
  readonly windowMs?: number;
  /** Failures per (IP, username key) per window (spec auth R8: 5). */
  readonly pairLimit?: number;
  /** Failures per IP per window across every hashing route (spec auth R8: 30). */
  readonly ipLimit?: number;
}

/** Past this many tracked keys, expired windows are swept before adding one. */
const SWEEP_AT = 10_000;

/**
 * In-memory failure limiter (spec auth R8): fixed windows from the first failure, reset
 * on restart. Keyed on the pair so a stranger cannot lock the owner out from the owner's
 * own address, and on the IP so one address cannot spray usernames.
 */
export class LoginLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly windowMs: number;
  private readonly pairLimit: number;
  private readonly ipLimit: number;

  constructor(options: LimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 15 * 60_000;
    this.pairLimit = options.pairLimit ?? 5;
    this.ipLimit = options.ipLimit ?? 30;
  }

  /** Whether `ip` may try again; `key` is the submitted username key, or null for a route without one. */
  check(ip: string, key: string | null, now: number = Date.now()): LimitCheck {
    const blocking = [
      { window: this.live(`ip:${ip}`, now), limit: this.ipLimit },
      ...(key === null
        ? []
        : [{ window: this.live(pairKey(ip, key), now), limit: this.pairLimit }]),
    ].find(({ window, limit }) => window !== undefined && window.count >= limit)?.window;
    if (blocking === undefined) return { allowed: true };
    const firstRefusal = !blocking.refusalLogged;
    blocking.refusalLogged = true;
    const retryAfterSec = Math.ceil((blocking.startedAt + this.windowMs - now) / 1000);
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1), firstRefusal };
  }

  /** Counts a failure against the IP and, when given, the pair. */
  fail(ip: string, key: string | null, now: number = Date.now()): void {
    this.bump(`ip:${ip}`, now);
    if (key !== null) this.bump(pairKey(ip, key), now);
  }

  /** A success clears the pair (spec auth R8), not the IP count. */
  succeed(ip: string, key: string): void {
    this.windows.delete(pairKey(ip, key));
  }

  private bump(id: string, now: number): void {
    const window = this.live(id, now);
    if (window) {
      window.count += 1;
      return;
    }
    if (this.windows.size >= SWEEP_AT) this.sweep(now);
    this.windows.set(id, { count: 1, startedAt: now, refusalLogged: false });
  }

  private live(id: string, now: number): Window | undefined {
    const window = this.windows.get(id);
    if (window && now - window.startedAt >= this.windowMs) {
      this.windows.delete(id);
      return undefined;
    }
    return window;
  }

  private sweep(now: number): void {
    for (const [id, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(id);
    }
  }
}

function pairKey(ip: string, key: string): string {
  return `pair:${ip}\u0000${key}`;
}
