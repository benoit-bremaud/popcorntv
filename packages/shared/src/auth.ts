/** Account contracts (spec auth §4, ADR-0010). */

/** Roles, single source for the zod schema and the SQLite enum (spec auth R2). */
export const ROLES = ['owner', 'viewer'] as const;

export type Role = (typeof ROLES)[number];

/** Username syntax (spec auth §4.1): 3–32 ASCII characters, unique case-insensitively. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

/** Password length bounds after NFC normalisation (spec auth R4). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** A signed-in account, as the API returns it (never the hash). */
export interface User {
  readonly id: string;
  readonly username: string;
  readonly role: Role;
}

/** Response of `GET /auth/status`; `user` is set when the request carried a valid session. */
export interface AuthStatus {
  readonly setupRequired: boolean;
  readonly user?: User;
}

/** Body of `POST /auth/setup` (UC11). */
export interface SetupBody {
  readonly token: string;
  readonly username: string;
  readonly password: string;
}

/** Body of `POST /auth/session` (UC13). */
export interface SignInBody {
  readonly username: string;
  readonly password: string;
}

/** Body of `PUT /auth/password` (UC19). */
export interface ChangePasswordBody {
  readonly current: string;
  readonly next: string;
}
