import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorCode } from '@popcorntv/shared';
import {
  adminApi,
  changePassword,
  loadAuthStatus,
  onUnauthenticated,
  redeem,
  setUpOwner,
  signIn,
  signOut,
} from '../api.js';
import { authMessage, linkFromHash, setupTokenFromHash } from './auth-api.js';

function respond(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status });
}

const user = { id: 'u1', username: 'owner', role: 'owner' };

describe('auth API client', () => {
  it('reads the status and throws when the server is unreachable or failing', async () => {
    await expect(loadAuthStatus(async () => respond({ setupRequired: true }))).resolves.toEqual({
      setupRequired: true,
    });
    await expect(
      loadAuthStatus(async () => {
        throw new TypeError('offline');
      }),
    ).rejects.toThrow('/auth/status');
    await expect(loadAuthStatus(async () => respond({}, 500))).rejects.toThrow('with 500');
  });

  it('posts sign-in and setup bodies and returns the user', async () => {
    const fetchFn = vi.fn(async () => respond(user));

    expect(await signIn({ username: 'owner', password: 'pw' }, fetchFn)).toEqual({
      ok: true,
      user,
    });
    expect(await setUpOwner({ token: 't', username: 'owner', password: 'pw' }, fetchFn)).toEqual({
      ok: true,
      user,
    });
    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"username":"owner","password":"pw"}',
    });
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/auth/setup', expect.anything());
  });

  it('returns the error code, or null offline or for an unreadable body', async () => {
    expect(
      await signIn({ username: 'a', password: 'b' }, async () =>
        respond({ error: 'invalid_credentials' }, 401),
      ),
    ).toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
    expect(
      await signIn({ username: 'a', password: 'b' }, async () => {
        throw new TypeError('offline');
      }),
    ).toEqual({ ok: false, error: null });
    expect(
      await signIn(
        { username: 'a', password: 'b' },
        async () => new Response('<html>', { status: 502 }),
      ),
    ).toEqual({ ok: false, error: null });
  });

  it('signs out here or everywhere; an already-ended session counts as signed out', async () => {
    const fetchFn = vi.fn(async () => respond(null, 204));

    expect(await signOut(false, fetchFn)).toBe(true);
    expect(await signOut(true, fetchFn)).toBe(true);
    expect(await signOut(false, async () => respond({ error: 'unauthenticated' }, 401))).toBe(true);
    expect(await signOut(false, async () => respond({ error: 'internal' }, 500))).toBe(false);
    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/auth/session', { method: 'DELETE' });
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/auth/sessions', { method: 'DELETE' });
  });

  it('changes the password', async () => {
    expect(
      await changePassword({ current: 'a', next: 'b' }, async () => respond(null, 204)),
    ).toEqual({
      ok: true,
    });
    expect(
      await changePassword({ current: 'a', next: 'b' }, async () =>
        respond({ error: 'invalid_credentials' }, 401),
      ),
    ).toEqual({ ok: false, error: 'invalid_credentials' });
    expect(await changePassword({ current: 'a', next: 'b' }, async () => respond({}, 200))).toEqual(
      {
        ok: false,
        error: null,
      },
    );
  });
});

describe('authMessage', () => {
  it.each<[ApiErrorCode | null, RegExp]>([
    ['invalid_credentials', /Wrong username or password/],
    ['too_many_attempts', /Too many attempts/],
    ['too_many_requests', /Too many requests/],
    ['token_invalid', /link is invalid, expired or already used/],
    ['username_taken', /username is taken/],
    ['last_owner', /last owner/],
    ['not_found', /already set up/],
    ['invalid_request', /Check the fields/],
    [null, /could not be reached/],
    ['internal', /Something went wrong/],
  ])('explains %s', (error, message) => {
    expect(authMessage(error)).toMatch(message);
  });
});

describe('setupTokenFromHash', () => {
  it.each([
    ['#/setup/abc_DEF-1', 'abc_DEF-1'],
    ['', ''],
    ['#/invite/abc', ''],
    ['#/setup/a b', ''],
  ])('reads %j as %j', (hash, token) => {
    expect(setupTokenFromHash(hash)).toBe(token);
  });
});

describe('links and redeem', () => {
  it.each([
    ['#/invite/abc_DEF-1', { kind: 'invite', token: 'abc_DEF-1' }],
    ['#/reset/xyz', { kind: 'reset', token: 'xyz' }],
    ['#/setup/xyz', null],
    ['#/invite/', null],
    ['#/invite/a b', null],
    ['', null],
  ])('reads %j as %j', (hash, expected) => {
    expect(linkFromHash(hash)).toEqual(expected);
  });

  it('posts a redeem body and returns the user', async () => {
    const fetchFn = vi.fn(async () => respond(user));

    expect(await redeem({ kind: 'reset', token: 't', password: 'pw' }, fetchFn)).toEqual({
      ok: true,
      user,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/auth/redeem',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('owner administration client', () => {
  it('calls each route with its method and body', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => respond([]));
    const api = adminApi(fetchFn);

    await api.accounts();
    await api.setRole('u2', 'owner');
    await api.deleteAccount('u2');
    await api.devices('u2');
    await api.endSessions('u2');
    await api.endSessions('u2', 's1');
    await api.issueReset('u2');
    await api.revokeReset('u2');
    await api.invitations();
    await api.invite('viewer');
    await api.revokeInvitation('i1');
    await api.events();

    expect(fetchFn.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      'GET /api/users',
      'PATCH /api/users/u2',
      'DELETE /api/users/u2',
      'GET /api/users/u2/sessions',
      'DELETE /api/users/u2/sessions',
      'DELETE /api/users/u2/sessions/s1',
      'POST /api/users/u2/reset',
      'DELETE /api/users/u2/reset',
      'GET /api/invitations',
      'POST /api/invitations',
      'DELETE /api/invitations/i1',
      'GET /api/auth/events',
    ]);
    expect(fetchFn.mock.calls[1]?.[1]?.body).toBe('{"role":"owner"}');
  });

  it('returns the value, the error code, or null when offline', async () => {
    expect(await adminApi(async () => respond(null, 204)).deleteAccount('u2')).toEqual({
      ok: true,
      value: null,
    });
    expect(
      await adminApi(async () => respond({ error: 'last_owner' }, 409)).setRole('u1', 'viewer'),
    ).toEqual({ ok: false, error: 'last_owner' });
    expect(
      await adminApi(async () => {
        throw new TypeError('offline');
      }).accounts(),
    ).toEqual({ ok: false, error: null });
  });

  it('tells the auth gate on a 401', async () => {
    const listener = vi.fn();
    onUnauthenticated(listener);

    await adminApi(async () => respond({ error: 'unauthenticated' }, 401)).events();
    onUnauthenticated(() => undefined);

    expect(listener).toHaveBeenCalled();
  });
});
