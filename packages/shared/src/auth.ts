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

/** Body of `POST /auth/redeem` (UC12 invitation, UC20 reset). */
export type RedeemBody =
  | {
      readonly kind: 'invite';
      readonly token: string;
      readonly username: string;
      readonly password: string;
    }
  | { readonly kind: 'reset'; readonly token: string; readonly password: string };

/** A one-time link, shown once (UC15, UC16): the raw token sits in the URL fragment. */
export interface IssuedLink {
  readonly link: string;
  readonly expiresAt: string;
}

/** A pending invitation in `GET /invitations` (UC15); never the token. */
export interface Invitation {
  readonly id: string;
  readonly role: Role;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** An account in `GET /users` (UC17). */
export interface Account extends User {
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
  readonly activeSessions: number;
}

/** A live device of an account in `GET /users/:id/sessions` (UC17). */
export interface DeviceSession {
  readonly id: string;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly userAgent: string | null;
}

/** What `auth_events` records (spec auth R9). */
export const AUTH_EVENT_KINDS = [
  'setup_done',
  'login_ok',
  'login_failed',
  'login_locked',
  'logout',
  'invite_issued',
  'invite_revoked',
  'reset_issued',
  'reset_revoked',
  'redeemed',
  'password_changed',
  'sessions_ended',
  'role_changed',
  'user_deleted',
] as const;

export type AuthEventKind = (typeof AUTH_EVENT_KINDS)[number];

/**
 * A row of `GET /auth/events` (UC18), newest first. `userId` is the account acted on; for
 * invitations and deletions it is the acting owner (null when an owner deleted themselves).
 */
export interface AuthEvent {
  readonly id: number;
  readonly at: string;
  readonly kind: AuthEventKind;
  readonly userId: string | null;
  readonly username: string | null;
  readonly ip: string | null;
  readonly usernameTried: string | null;
}
