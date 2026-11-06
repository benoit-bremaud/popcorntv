import type { ApiErrorCode } from '@popcorntv/shared';
import { changePassword, loadAuthStatus, redeem, setUpOwner, signIn, signOut } from '../api.js';

/** The auth calls the screens make; injected in tests, the real API by default. */
export interface AuthApi {
  readonly status: typeof loadAuthStatus;
  readonly setUp: typeof setUpOwner;
  readonly redeem: typeof redeem;
  readonly signIn: typeof signIn;
  readonly signOut: typeof signOut;
  readonly changePassword: typeof changePassword;
}

export const defaultAuthApi: AuthApi = {
  status: loadAuthStatus,
  setUp: setUpOwner,
  redeem,
  signIn,
  signOut,
  changePassword,
};

/** What to tell the person for an auth error code; null means the server was unreachable. */
export function authMessage(error: ApiErrorCode | null): string {
  switch (error) {
    case 'invalid_credentials':
      return 'Wrong username or password.';
    case 'too_many_attempts':
      return 'Too many attempts. Wait a few minutes, then try again.';
    case 'too_many_requests':
      return 'Too many requests. Wait a minute, then try again.';
    case 'token_invalid':
      return 'This link is invalid, expired or already used. Ask for a new one (a setup link: restart the server).';
    case 'username_taken':
      return 'This username is taken. Pick another one.';
    case 'last_owner':
      return 'The last owner cannot be demoted or deleted.';
    case 'not_found':
      return 'This server is already set up. Sign in instead.';
    case 'invalid_request':
      return 'Check the fields: a username of 3–32 letters, digits, . _ or -, a password of 12–128 characters.';
    case null:
      return 'The server could not be reached.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** The setup token carried by a `#/setup/<token>` link (spec auth UC11), or an empty string. */
export function setupTokenFromHash(hash: string): string {
  const match = /^#\/setup\/([\w-]+)$/.exec(hash);
  return match?.[1] ?? '';
}

/** An invitation or reset link (`#/invite/<token>`, `#/reset/<token>`, spec auth §4.2), or null. */
export function linkFromHash(
  hash: string,
): { readonly kind: 'invite' | 'reset'; readonly token: string } | null {
  const match = /^#\/(invite|reset)\/([\w-]+)$/.exec(hash);
  const kind = match?.[1];
  const token = match?.[2];
  if ((kind !== 'invite' && kind !== 'reset') || token === undefined) return null;
  return { kind, token };
}
