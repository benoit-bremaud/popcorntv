import type { ApiErrorCode } from '@popcorntv/shared';
import { changePassword, loadAuthStatus, setUpOwner, signIn, signOut } from '../api.js';

/** The auth calls the screens make; injected in tests, the real API by default. */
export interface AuthApi {
  readonly status: typeof loadAuthStatus;
  readonly setUp: typeof setUpOwner;
  readonly signIn: typeof signIn;
  readonly signOut: typeof signOut;
  readonly changePassword: typeof changePassword;
}

export const defaultAuthApi: AuthApi = {
  status: loadAuthStatus,
  setUp: setUpOwner,
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
    case 'token_invalid':
      return 'This setup link is invalid or expired. Restart the server for a new one.';
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
