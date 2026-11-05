import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@popcorntv/shared';
import type { AdminApi } from '../api.js';
import { AdminPanel } from './AdminPanel.js';
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

  it('asks for confirmation before deleting, and never offers to delete oneself', async () => {
    const user = userEvent.setup();
    const { api } = panel();

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
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
});
