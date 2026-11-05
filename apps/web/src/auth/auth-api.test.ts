import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorCode } from '@popcorntv/shared';
import { changePassword, loadAuthStatus, setUpOwner, signIn, signOut } from '../api.js';
import { authMessage, setupTokenFromHash } from './auth-api.js';

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
    ['token_invalid', /setup link is invalid/],
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
