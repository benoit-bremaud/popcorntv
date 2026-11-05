import { vi } from 'vitest';
import type { Account, AuthEvent, Invitation } from '@popcorntv/shared';
import type { AdminApi } from '../api.js';

/** Test double of the owner administration API: every call succeeds unless overridden. */

export const ownerAccount: Account = {
  id: 'u1',
  username: 'owner',
  role: 'owner',
  createdAt: '2026-11-01T10:00:00.000Z',
  lastLoginAt: '2026-11-05T10:00:00.000Z',
  activeSessions: 1,
};

export const kidAccount: Account = {
  id: 'u2',
  username: 'kid',
  role: 'viewer',
  createdAt: '2026-11-02T10:00:00.000Z',
  lastLoginAt: null,
  activeSessions: 0,
};

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });
const link = { link: 'http://localhost:5173/#/invite/abc', expiresAt: '2026-11-08T10:00:00.000Z' };

export function fakeAdminApi(overrides: Partial<AdminApi> = {}): AdminApi {
  return {
    accounts: vi.fn(() => ok<Account[]>([kidAccount, ownerAccount])),
    setRole: vi.fn(() => ok({ id: 'u2', username: 'kid', role: 'owner' as const })),
    deleteAccount: vi.fn(() => ok(null)),
    devices: vi.fn(() =>
      ok([
        {
          id: 's1',
          createdAt: '2026-11-05T10:00:00.000Z',
          lastSeenAt: '2026-11-05T10:00:00.000Z',
          userAgent: 'Firefox',
        },
      ]),
    ),
    endSessions: vi.fn(() => ok(null)),
    issueReset: vi.fn(() =>
      ok({ link: 'http://localhost:5173/#/reset/xyz', expiresAt: link.expiresAt }),
    ),
    revokeReset: vi.fn(() => ok(null)),
    invitations: vi.fn(() =>
      ok<Invitation[]>([
        { id: 'i1', role: 'viewer', createdAt: link.expiresAt, expiresAt: link.expiresAt },
      ]),
    ),
    invite: vi.fn(() => ok(link)),
    revokeInvitation: vi.fn(() => ok(null)),
    events: vi.fn(() =>
      ok<AuthEvent[]>([
        {
          id: 1,
          at: '2026-11-05T10:00:00.000Z',
          kind: 'login_failed',
          userId: null,
          username: null,
          ip: '127.0.0.1',
          usernameTried: 'mallory',
        },
      ]),
    ),
    ...overrides,
  };
}
