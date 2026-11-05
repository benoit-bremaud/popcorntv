import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@popcorntv/shared';
import { AccountMenu } from './AccountMenu.js';
import type { AuthApi } from './auth-api.js';

const viewer: User = { id: 'u2', username: 'kid', role: 'viewer' };

function menu(api: Partial<Pick<AuthApi, 'signOut' | 'changePassword'>> = {}) {
  const onSignedOut = vi.fn();
  const full = {
    signOut: vi.fn(async () => true),
    changePassword: vi.fn(async () => ({ ok: true as const })),
    ...api,
  };
  render(<AccountMenu user={viewer} api={full} onSignedOut={onSignedOut} />);
  return { api: full, onSignedOut };
}

describe('AccountMenu', () => {
  it('signs out this device', async () => {
    const user = userEvent.setup();
    const { api, onSignedOut } = menu();

    await user.click(screen.getByText('kid'));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(api.signOut).toHaveBeenCalledWith(false);
    expect(onSignedOut).toHaveBeenCalled();
  });

  it('stays signed in and says so when the server cannot be reached', async () => {
    const user = userEvent.setup();
    const { onSignedOut } = menu({ signOut: vi.fn(async () => false) });

    await user.click(screen.getByText('kid'));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(onSignedOut).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('The server could not be reached.');
  });

  it('changes the password', async () => {
    const user = userEvent.setup();
    const { api } = menu();

    await user.click(screen.getByText('kid'));
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('Current password'), 'old password!!');
    await user.type(screen.getByLabelText('New password'), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.changePassword).toHaveBeenCalledWith({
      current: 'old password!!',
      next: 'a brand new password',
    });
    expect(screen.getByRole('status')).toHaveTextContent('Password changed.');
  });

  it('explains a refused change and can cancel', async () => {
    const user = userEvent.setup();
    menu({
      changePassword: vi.fn(async () => ({
        ok: false as const,
        error: 'invalid_credentials' as const,
      })),
    });

    await user.click(screen.getByText('kid'));
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('Current password'), 'wrong password');
    await user.type(screen.getByLabelText('New password'), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('status')).toHaveTextContent('Wrong username or password.');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });
});
