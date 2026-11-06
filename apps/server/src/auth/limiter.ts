import { isIPv6 } from 'node:net';

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
  check(address: string, key: string | null, now: number = Date.now()): LimitCheck {
    const ip = clientKey(address);
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

  /**
   * Counts a failure against the IP and, when given, the pair. Hashing routes call it
   * before awaiting the hasher, so concurrent attempts cannot all pass `check`.
   */
  fail(address: string, key: string | null, now: number = Date.now()): void {
    const ip = clientKey(address);
    this.bump(`ip:${ip}`, now);
    if (key !== null) this.bump(pairKey(ip, key), now);
  }

  /**
   * A success clears the pair (spec auth R8) and refunds the attempt reserved on the IP.
   * When the IP window rolled over while the hash ran, the refund lands on the newer
   * window: one attempt in the caller's favour, accepted rather than tracking windows.
   */
  succeed(address: string, key: string): void {
    const ip = clientKey(address);
    this.windows.delete(pairKey(ip, key));
    const window = this.windows.get(`ip:${ip}`);
    if (window && window.count > 0) window.count -= 1;
  }

  /** Gives back an attempt that never reached a verdict (busy hasher, or a redeem that is not a guess). */
  refund(address: string, key: string | null): void {
    const ip = clientKey(address);
    for (const id of key === null ? [`ip:${ip}`] : [`ip:${ip}`, pairKey(ip, key)]) {
      const window = this.windows.get(id);
      if (window && window.count > 0) window.count -= 1;
    }
  }

  /** Tracked keys, for tests of the sweep. */
  get size(): number {
    return this.windows.size;
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

/**
 * The limited identity of an address: IPv4 as is (IPv4-mapped IPv6 included), IPv6 by
 * its /64, since one client controls a whole /64.
 */
export function clientKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1] ?? address;
  if (!isIPv6(address)) return address;
  const [head = '', tail = ''] = address.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = address.includes('::') && tail !== '' ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...new Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

function pairKey(ip: string, key: string): string {
  return `pair:${ip}\u0000${key}`;
}
