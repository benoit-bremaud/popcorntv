import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@popcorntv/shared';
import type { AdminApi } from '../api.js';
import { AdminPanel, adminMessage } from './AdminPanel.js';
import { fakeAdminApi } from './admin-fixtures.js';

const owner: User = { id: 'u1', username: 'owner', role: 'owner' };

function panel(overrides: Partial<AdminApi> = {}) {
  const api = fakeAdminApi(overrides);
  const onClose = vi.fn();
  render(<AdminPanel api={api} user={owner} onClose={onClose} />);
  return { api, onClose };
}

describe('AdminPanel', () => {
  it('lists accounts, pending invitations and the activity', async () => {
    panel();

    expect(await screen.findByText(/last sign-in never/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Pending invitations' })).toHaveTextContent('viewer');
    expect(screen.getByRole('list', { name: 'Sign-in activity' })).toHaveTextContent(
      'login failed',
    );
    expect(screen.getByRole('list', { name: 'Sign-in activity' })).toHaveTextContent('mallory');
  });

  it('creates an invitation link and shows it once', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.selectOptions(await screen.findByLabelText('Role'), 'owner');
    await user.click(screen.getByRole('button', { name: 'Create an invitation link' }));

    expect(api.invite).toHaveBeenCalledWith('owner');
    expect(await screen.findByLabelText('Link to send')).toHaveValue(
      'http://localhost:5173/#/invite/abc',
    );
  });

  it('revokes an invitation', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(api.revokeInvitation).toHaveBeenCalledWith('i1');
  });

  it('changes a role, issues a reset link and signs an account out', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.selectOptions(await screen.findByLabelText('Role of kid'), 'owner');
    await user.click(screen.getAllByRole('button', { name: 'Reset link' })[0] as HTMLElement);
    await user.click(
      screen.getAllByRole('button', { name: 'Sign out everywhere' })[0] as HTMLElement,
    );

    expect(api.setRole).toHaveBeenCalledWith('u2', 'owner');
    expect(api.issueReset).toHaveBeenCalledWith('u2');
    expect(api.endSessions).toHaveBeenCalledWith('u2');
  });

  it('lists the devices of an account and signs one out', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.click((await screen.findAllByRole('button', { name: 'Devices' }))[0] as HTMLElement);
    await user.click(await screen.findByRole('button', { name: 'Sign out this device' }));

    expect(screen.getByRole('list', { name: 'Devices of kid' })).toHaveTextContent('Firefox');
    expect(api.endSessions).toHaveBeenCalledWith('u2', 's1');
  });

  it('names each device readably and keeps the raw user agent as a tooltip', async () => {
    const user = userEvent.setup();
    const raw =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const seen = '2026-11-05T10:00:00.000Z';
    panel({
      devices: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          value: [
            { id: 's1', createdAt: seen, lastSeenAt: seen, userAgent: raw },
            { id: 's2', createdAt: seen, lastSeenAt: seen, userAgent: null },
          ],
        }),
      ),
    });

    await user.click((await screen.findAllByRole('button', { name: 'Devices' }))[0] as HTMLElement);

    const list = await screen.findByRole('list', { name: 'Devices of kid' });
    expect(list).toHaveTextContent(/Chrome on Linux/);
    expect(list).toHaveTextContent(/Unknown device/);
    expect(list).not.toHaveTextContent(/Mozilla/);
    expect(screen.getByTitle(raw)).toHaveTextContent(/Chrome on Linux/);
  });

  it('refreshes the lists when the devices of an account cannot be loaded', async () => {
    const user = userEvent.setup();
    const { api } = panel({
      devices: vi.fn(() => Promise.resolve({ ok: false as const, error: 'not_found' as const })),
    });

    await user.click((await screen.findAllByRole('button', { name: 'Devices' }))[0] as HTMLElement);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'It no longer exists: the list was refreshed.',
    );
    expect(api.accounts).toHaveBeenCalledTimes(2);
  });

  it('asks for confirmation before deleting, and never offers to delete oneself', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(api.deleteAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm deletion of kid' }));

    expect(api.deleteAccount).toHaveBeenCalledWith('u2');
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('shows a refusal such as the last-owner rule', async () => {
    const user = userEvent.setup();
    panel({ setRole: vi.fn(async () => ({ ok: false as const, error: 'last_owner' as const })) });

    await user.selectOptions(await screen.findByLabelText('Role of owner'), 'viewer');

    expect(await screen.findByRole('alert')).toHaveTextContent('last owner');
  });

  it('closes', async () => {
    const user = userEvent.setup();
    const { onClose } = panel();

    await user.click(await screen.findByRole('button', { name: 'Done' }));

    expect(onClose).toHaveBeenCalled();
  });

  it('revokes a reset link', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    const [kidRevoke] = await screen.findAllByRole('button', { name: 'Revoke reset link' });
    await user.click(kidRevoke as HTMLElement);

    expect(api.revokeReset).toHaveBeenCalledWith('u2');
  });

  it('hides the reset link of an account once its role changes', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(
      (await screen.findAllByRole('button', { name: 'Reset link' }))[0] as HTMLElement,
    );
    await screen.findByLabelText('Link to send');
    await user.selectOptions(screen.getByLabelText('Role of kid'), 'owner');

    expect(screen.queryByLabelText('Link to send')).toBeNull();
  });

  it('hides the reset link of an account once deleted', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(
      (await screen.findAllByRole('button', { name: 'Reset link' }))[0] as HTMLElement,
    );
    await screen.findByLabelText('Link to send');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm deletion of kid' }));

    expect(screen.queryByLabelText('Link to send')).toBeNull();
  });

  it('closes the panel when the owner demotes themself', async () => {
    const user = userEvent.setup();
    const { api, onClose } = panel();

    await user.selectOptions(await screen.findByLabelText('Role of owner'), 'viewer');

    expect(onClose).toHaveBeenCalledOnce();
    // The demoted owner may no longer list accounts: no reload after closing.
    expect(api.accounts).toHaveBeenCalledOnce();
  });

  it('stays open when another account is demoted', async () => {
    const user = userEvent.setup();
    const { onClose } = panel();

    await user.selectOptions(await screen.findByLabelText('Role of kid'), 'viewer');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps an invitation link on screen when a reset link is revoked', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(await screen.findByRole('button', { name: 'Create an invitation link' }));
    await screen.findByLabelText('Link to send');
    await user.click(
      screen.getAllByRole('button', { name: 'Revoke reset link' })[0] as HTMLElement,
    );

    expect(screen.getByLabelText('Link to send')).toHaveValue('http://localhost:5173/#/invite/abc');
  });

  it('hides the reset link of an account once revoked', async () => {
    const user = userEvent.setup();
    panel();

    await user.click(
      (await screen.findAllByRole('button', { name: 'Reset link' }))[0] as HTMLElement,
    );
    await screen.findByLabelText('Link to send');
    await user.click(
      screen.getAllByRole('button', { name: 'Revoke reset link' })[0] as HTMLElement,
    );

    expect(screen.queryByLabelText('Link to send')).toBeNull();
  });

  it('refreshes the lists after a refusal and explains it', async () => {
    const user = userEvent.setup();
    const { api } = panel({
      revokeInvitation: vi.fn(async () => ({ ok: false as const, error: 'not_found' as const })),
    });
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer exists');
    expect(api.invitations).toHaveBeenCalledTimes(2);
  });
});

describe('adminMessage', () => {
  it.each([
    ['not_found', /no longer exists/],
    ['session_not_found', /no longer exists/],
    ['forbidden', /Only an owner/],
    ['last_owner', /last owner/],
    [null, /could not be reached/],
  ] as const)('explains %s', (code, expected) => {
    expect(adminMessage(code)).toMatch(expected);
  });
});
