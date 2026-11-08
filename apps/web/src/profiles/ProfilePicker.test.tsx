import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '@popcorntv/shared';
import { ProfilePicker } from './ProfilePicker.js';

const me: Profile = { id: 'default', name: 'Me', avatar: 'red' };
const rtl: Profile = { id: 'p2', name: 'مريم 🎬', avatar: 'blue' };

function setup(profiles: readonly Profile[] = [me]) {
  const onPick = vi.fn();
  const onManage = vi.fn();
  render(<ProfilePicker profiles={profiles} onPick={onPick} onManage={onManage} />);
  return { user: userEvent.setup(), onPick, onManage };
}

describe('ProfilePicker', () => {
  it('names each profile button after the profile alone and picks it (#173)', async () => {
    const { user, onPick } = setup();

    await user.click(screen.getByRole('button', { name: 'Me' }));

    expect(onPick).toHaveBeenCalledWith(me);
  });

  it('never folds the avatar initial into the accessible name (#173)', () => {
    setup();

    expect(screen.queryByRole('button', { name: 'MMe' })).not.toBeInTheDocument();
    expect(screen.getByText('M')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps an RTL and emoji name intact, with no initial before it (#173)', () => {
    setup([me, rtl]);

    expect(screen.getByRole('button', { name: 'مريم 🎬' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
