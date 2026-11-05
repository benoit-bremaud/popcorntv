import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A fresh 256-bit random token, base64url (43 characters): cookie, setup and link tokens. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex of a token: the only form ever stored (spec auth R5). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two token hashes of the same length. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
