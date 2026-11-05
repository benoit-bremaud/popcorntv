import { hashToken, newToken, sameHash } from './token.js';

/** Lifetime of the first-owner setup token (spec auth UC11). */
const SETUP_TTL_MS = 60 * 60_000;

/**
 * The one-time first-owner token (ADR-0010 §4), kept in memory only: SHA-256 and expiry.
 * A new `issue` replaces the previous token; a restart issues a fresh one.
 */
export class SetupToken {
  private current: { readonly hash: string; readonly expiresAt: number } | null = null;

  /** Returns the raw token, to be printed once; only its hash is kept. */
  issue(now: number = Date.now()): string {
    const token = newToken();
    this.current = { hash: hashToken(token), expiresAt: now + SETUP_TTL_MS };
    return token;
  }

  /** True when `token` is the live one; it stays valid until `clear` (setup may still fail later). */
  matches(token: string, now: number = Date.now()): boolean {
    const current = this.current;
    return current !== null && now < current.expiresAt && sameHash(hashToken(token), current.hash);
  }

  clear(): void {
    this.current = null;
  }
}
