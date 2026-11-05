import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@popcorntv/shared';
import { loadProfiles } from '../api.js';
import { AuthGate } from './AuthGate.js';
import type { AuthApi } from './auth-api.js';
import { fakeAdminApi } from './admin-fixtures.js';

const owner: User = { id: 'u1', username: 'owner', role: 'owner' };

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    status: vi.fn(async () => ({ setupRequired: false })),
    setUp: vi.fn(async () => ({ ok: true as const, user: owner })),
    redeem: vi.fn(async () => ({ ok: true as const, user: owner })),
    signIn: vi.fn(async () => ({ ok: true as const, user: owner })),
    signOut: vi.fn(async () => true),
    changePassword: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

function gate(api: AuthApi, hash = '') {
  const history = { replaceState: vi.fn() };
  render(
    <AuthGate api={api} admin={fakeAdminApi()} location={{ hash, pathname: '/' }} history={history}>
      {(user, account) => (
        <>
          <p>Hello {user.username}</p>
          {account}
        </>
      )}
    </AuthGate>,
  );
  return history;
}

describe('AuthGate', () => {
  it('shows the app for a signed-in session', async () => {
    gate(fakeApi({ status: vi.fn(async () => ({ setupRequired: false, user: owner })) }));

    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });

  it('signs in and shows the app', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    gate(api);

    await user.type(await screen.findByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText('Password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(api.signIn).toHaveBeenCalledWith({
      username: 'owner',
      password: 'correct horse battery',
    });
    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });

  it('shows why a sign-in failed', async () => {
    const api = fakeApi({
      signIn: vi.fn(async () => ({ ok: false as const, error: 'invalid_credentials' as const })),
    });
    const user = userEvent.setup();
    gate(api);

    await user.type(await screen.findByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText('Password'), 'wrong password!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password.');
  });

  it('prefills the setup token from the link and clears it from the address bar', async () => {
    const api = fakeApi({ status: vi.fn(async () => ({ setupRequired: true })) });
    const user = userEvent.setup();
    const history = gate(api, '#/setup/abc_DEF-123');

    expect(await screen.findByLabelText('Setup token')).toHaveValue('abc_DEF-123');
    await user.type(screen.getByLabelText('Username'), 'owner');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create the owner account' }));

    expect(api.setUp).toHaveBeenCalledWith({
      token: 'abc_DEF-123',
      username: 'owner',
      password: 'correct horse battery',
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });

  it('offers a retry when the server is unreachable', async () => {
    const status = vi
      .fn<AuthApi['status']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ setupRequired: false, user: owner });
    const user = userEvent.setup();
    gate(fakeApi({ status }));

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });

  it('goes back to sign-in when an API call answers 401', async () => {
    gate(fakeApi({ status: vi.fn(async () => ({ setupRequired: false, user: owner })) }));
    await screen.findByText('Hello owner');

    await expect(loadProfiles(async () => new Response('{}', { status: 401 }))).rejects.toThrow();

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs out from the account menu', async () => {
    const api = fakeApi({ status: vi.fn(async () => ({ setupRequired: false, user: owner })) });
    const user = userEvent.setup();
    gate(api);

    await user.click(await screen.findByText('owner', { selector: 'summary *, summary' }));
    await user.click(screen.getByRole('button', { name: 'Sign out everywhere' }));

    expect(api.signOut).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('accepts an invitation from its link, then clears the link', async () => {
    const api = fakeApi();
    const user = userEvent.setup();
    const history = gate(api, '#/invite/inv_TOKEN-1');

    await user.type(await screen.findByLabelText('Username'), 'guest');
    await user.type(screen.getByLabelText(/^Password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));

    expect(api.redeem).toHaveBeenCalledWith({
      kind: 'invite',
      token: 'inv_TOKEN-1',
      username: 'guest',
      password: 'correct horse battery',
    });
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });

  it('sets a new password from a reset link, even with a session', async () => {
    const api = fakeApi({ status: vi.fn(async () => ({ setupRequired: false, user: owner })) });
    const user = userEvent.setup();
    gate(api, '#/reset/rst');

    await user.type(await screen.findByLabelText(/^New password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));

    expect(api.redeem).toHaveBeenCalledWith({
      kind: 'reset',
      token: 'rst',
      password: 'correct horse battery',
    });
  });

  it('explains a used link and leaves it for sign-in', async () => {
    const api = fakeApi({
      redeem: vi.fn(async () => ({ ok: false as const, error: 'token_invalid' as const })),
    });
    const user = userEvent.setup();
    const history = gate(api, '#/reset/used');

    await user.type(await screen.findByLabelText(/^New password/), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Save and sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already used');
    await user.click(screen.getByRole('button', { name: 'Sign in instead' }));

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('opens and closes the administration for an owner', async () => {
    const user = userEvent.setup();
    gate(fakeApi({ status: vi.fn(async () => ({ setupRequired: false, user: owner })) }));

    await user.click(await screen.findByText('owner', { selector: 'summary *, summary' }));
    await user.click(screen.getByRole('button', { name: 'Administration' }));
    expect(await screen.findByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('Hello owner')).toBeInTheDocument();
  });
});
