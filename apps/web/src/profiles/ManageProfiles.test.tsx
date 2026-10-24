import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Profile } from '@popcorntv/shared';
import type { ProfileResult } from '../api.js';
import { ManageProfiles } from './ManageProfiles.js';
import type { ProfileApi } from './ManageProfiles.js';

const me: Profile = { id: 'default', name: 'Me', avatar: 'red' };

function setup(api: Partial<ProfileApi> = {}) {
  const ok = async (): Promise<ProfileResult> => ({ ok: true, profile: me });
  const full: ProfileApi = {
    create: vi.fn(ok),
    update: vi.fn(ok),
    remove: vi.fn(async () => ({ ok: true }) as const),
    ...api,
  };
  const onChanged = vi.fn();
  const onDone = vi.fn();
  render(<ManageProfiles profiles={[me]} onChanged={onChanged} onDone={onDone} api={full} />);
  return { user: userEvent.setup(), api: full, onChanged, onDone };
}

describe('ManageProfiles', () => {
  it('adds a profile with a trimmed name and the chosen colour, then clears the form', async () => {
    const { user, api, onChanged } = setup();
    const name = screen.getByRole('textbox', { name: 'Add a profile: name' });

    await user.type(name, '  Kid ');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Add a profile: colour' }),
      'teal',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.create).toHaveBeenCalledWith({ name: 'Kid', avatar: 'teal' });
    expect(onChanged).toHaveBeenCalledOnce();
    expect(name).toHaveValue('');
  });

  it('renames a profile', async () => {
    const { user, api } = setup();
    const name = screen.getByRole('textbox', { name: 'Edit Me: name' });

    await user.clear(name);
    await user.type(name, 'Dad');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.update).toHaveBeenCalledWith('default', { name: 'Dad', avatar: 'red' });
  });

  it('deletes only after a confirm and shows why the server refused', async () => {
    const { user, api, onChanged } = setup({
      remove: vi.fn(async () => ({ ok: false, error: 'last_profile' }) as const),
    });

    await user.click(screen.getByRole('button', { name: 'Delete Me' }));
    expect(api.remove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Me and their history' }));

    expect(api.remove).toHaveBeenCalledWith('default');
    expect(screen.getByRole('alert')).toHaveTextContent('The last profile cannot be deleted.');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each([
    ['profile_name_taken', 'That name is already used.'],
    ['profile_limit', 'No more profiles can be added.'],
    [null, 'The server could not be reached.'],
  ] as const)('explains a refused add (%s)', async (error, text) => {
    const { user } = setup({ create: vi.fn(async () => ({ ok: false, error }) as const) });

    await user.type(screen.getByRole('textbox', { name: 'Add a profile: name' }), 'Me');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('closes with Done', async () => {
    const { user, onDone } = setup();

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(onDone).toHaveBeenCalledOnce();
  });
});
