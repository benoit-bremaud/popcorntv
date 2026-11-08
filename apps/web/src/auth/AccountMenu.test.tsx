import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { User } from '@popcorntv/shared';
import { AccountMenu } from './AccountMenu.js';
import type { AuthApi } from './auth-api.js';

const viewer: User = { id: 'u2', username: 'kid', role: 'viewer' };

function menu(
  api: Partial<Pick<AuthApi, 'signOut' | 'changePassword' | 'version'>> = {},
  account: User = viewer,
) {
  const onSignedOut = vi.fn();
  const onAdmin = vi.fn();
  const full = {
    signOut: vi.fn(async () => true),
    changePassword: vi.fn(async () => ({ ok: true as const })),
    version: vi.fn(async (): Promise<string | null> => 'v1.2.0'),
    ...api,
  };
  render(
    <>
      <button type="button">elsewhere</button>
      <AccountMenu user={account} api={full} onSignedOut={onSignedOut} onAdmin={onAdmin} />
    </>,
  );
  return { api: full, onSignedOut, onAdmin };
}

describe('AccountMenu', () => {
  it('shows the running version (#162)', async () => {
    const user = userEvent.setup();
    menu();

    await user.click(screen.getByText('kid'));

    expect(await screen.findByText('PopCornTV v1.2.0')).toBeInTheDocument();
  });

  it('omits the version when the server cannot say', async () => {
    const user = userEvent.setup();
    const { api } = menu({ version: vi.fn(async () => null) });

    await user.click(screen.getByText('kid'));

    await vi.waitFor(() => expect(api.version).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByText(/PopCornTV/)).not.toBeInTheDocument();
  });

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
    expect(screen.getByText('kid').closest('details')).toHaveAttribute('open');
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

    expect(screen.getByRole('status')).toHaveTextContent('Wrong current password.');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('goes back to sign-in when the session ended during a change', async () => {
    const user = userEvent.setup();
    const { onSignedOut } = menu({
      changePassword: vi.fn(async () => ({
        ok: false as const,
        error: 'unauthenticated' as const,
      })),
    });

    await user.click(screen.getByText('kid'));
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.type(screen.getByLabelText('Current password'), 'old password!!');
    await user.type(screen.getByLabelText('New password'), 'a brand new password');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSignedOut).toHaveBeenCalled();
  });

  it('offers the administration to owners only', async () => {
    const user = userEvent.setup();
    const { onAdmin } = menu({}, { id: 'u1', username: 'boss', role: 'owner' });

    await user.click(screen.getByText('boss'));
    await user.click(screen.getByRole('button', { name: 'Administration' }));

    expect(onAdmin).toHaveBeenCalled();
  });

  it('hides the administration from viewers', async () => {
    const user = userEvent.setup();
    menu();

    await user.click(screen.getByText('kid'));

    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
  });

  describe('closing (#164)', () => {
    const details = () => screen.getByText('kid').closest('details') as HTMLDetailsElement;
    const summary = () => screen.getByText('kid').closest('summary') as HTMLElement;

    it('closes on Escape with focus inside and gives focus back to the summary', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      screen.getByRole('button', { name: 'Sign out' }).focus();

      await user.keyboard('{Escape}');

      expect(details().open).toBe(false);
      expect(summary()).toHaveFocus();
    });

    it('closes on Escape with focus outside the menu', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      screen.getByRole('button', { name: 'elsewhere' }).focus();

      await user.keyboard('{Escape}');

      expect(details().open).toBe(false);
      expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    });

    it('closes on Escape from the password field and focuses the summary', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      await user.click(screen.getByRole('button', { name: 'Change password' }));
      await user.click(screen.getByLabelText('Current password'));

      await user.keyboard('{Escape}');

      expect(details().open).toBe(false);
      expect(summary()).toHaveFocus();
    });

    it('ignores other keys', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));

      await user.keyboard('a');

      expect(details().open).toBe(true);
    });

    it('does nothing on Escape when already closed', async () => {
      const user = userEvent.setup();
      menu();
      screen.getByRole('button', { name: 'elsewhere' }).focus();

      await user.keyboard('{Escape}');

      expect(details().open).toBe(false);
      expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    });

    it('leaves Escape to a dialog open above it', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      const dialog = document.createElement('dialog');
      dialog.setAttribute('open', '');
      document.body.append(dialog);
      onTestFinished(() => dialog.remove());

      await user.keyboard('{Escape}');

      expect(details().open).toBe(true);
    });

    it('closes on a pointer-down outside, mouse or touch, without moving focus', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      fireEvent.pointerDown(document.body, { pointerType: 'touch' });

      expect(details().open).toBe(false);

      await user.click(screen.getByText('kid'));
      await user.click(screen.getByRole('button', { name: 'elsewhere' }));
      expect(details().open).toBe(false);
      expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
    });

    it('stays open on a click inside the panel', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));

      await user.click(screen.getByRole('button', { name: 'Change password' }));
      await user.click(screen.getByLabelText('Current password'));

      expect(details().open).toBe(true);
    });

    it('toggles once on a click on the summary', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      expect(details().open).toBe(true);

      await user.click(screen.getByText('kid'));

      expect(details().open).toBe(false);
    });

    it('closes when the administration is opened', async () => {
      const user = userEvent.setup();
      const { onAdmin } = menu({}, { id: 'u1', username: 'kid', role: 'owner' });
      await user.click(screen.getByText('kid'));

      await user.click(screen.getByRole('button', { name: 'Administration' }));

      expect(onAdmin).toHaveBeenCalled();
      expect(details().open).toBe(false);
    });

    it('stops listening once closed', async () => {
      const user = userEvent.setup();
      menu();
      await user.click(screen.getByText('kid'));
      await user.keyboard('{Escape}');
      const remove = vi.spyOn(document, 'removeEventListener');

      await user.click(screen.getByText('kid'));
      await user.click(screen.getByText('kid'));

      expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function));
      remove.mockRestore();
    });
  });
});
