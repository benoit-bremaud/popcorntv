import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AdminApi } from '../api.js';
import { fakeAdminApi, filmsLibrary } from './admin-fixtures.js';
import { LibrarySection, libraryMessage } from './LibrarySection.js';

function section(overrides: Partial<AdminApi> = {}) {
  const api = fakeAdminApi(overrides);
  render(<LibrarySection api={api} />);
  return { api, user: userEvent.setup() };
}

describe('LibrarySection', () => {
  it('lists the libraries with their kind and root', async () => {
    section();

    const list = await screen.findByRole('list', { name: 'Libraries' });

    expect(within(list).getByText('Films')).toBeInTheDocument();
    expect(list).toHaveTextContent('films · /app/media/films');
  });

  it('adds a library from the first free folder with the suggested name', async () => {
    const { api, user } = section();

    await screen.findByRole('option', { name: 'series' });
    await user.selectOptions(screen.getByLabelText('Kind'), 'series');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.createLibrary).toHaveBeenCalledWith({
      name: 'Series',
      rootPath: '/app/media/series',
      kind: 'series',
    });
    expect(await screen.findByText(/Series added: scan it/)).toBeInTheDocument();
  });

  it('never offers a folder another library already uses', async () => {
    section();

    await screen.findByRole('option', { name: 'series' });

    expect(
      within(screen.getByLabelText('Folder')).queryByRole('option', { name: 'films' }),
    ).toBeNull();
  });

  it('adds a library from a typed path', async () => {
    const { api, user } = section();

    await screen.findByRole('option', { name: 'series' });
    await user.selectOptions(screen.getByLabelText('Folder'), 'Other folder…');
    await user.type(screen.getByLabelText('Path'), ' /app/media/docs ');
    await user.type(screen.getByLabelText('Name'), 'Docs');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.createLibrary).toHaveBeenCalledWith({
      name: 'Docs',
      rootPath: '/app/media/docs',
      kind: 'films',
    });
  });

  it('shows an overlap refusal', async () => {
    const { user } = section({
      createLibrary: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'root_in_use' as const }),
      ),
    });

    await screen.findByRole('option', { name: 'series' });
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('another library');
  });

  it('scans a library, disables its buttons meanwhile and shows the report', async () => {
    let finish: () => void = () => undefined;
    const scan = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<AdminApi['scan']>>>((resolve) => {
          finish = () =>
            resolve({
              ok: true,
              value: { added: 3, updated: 1, removed: 0, skipped: [], metadata: null },
            });
        }),
    );
    const { user } = section({ scan });

    await user.click(await screen.findByRole('button', { name: 'Scan' }));

    expect(scan).toHaveBeenCalledWith('l1');
    expect(screen.getByRole('button', { name: 'Scanning…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh metadata' })).toBeDisabled();
    finish();
    expect(await screen.findByText(/Films scanned: 3 added, 1 updated/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeEnabled();
  });

  it('shows the metadata summary of a scan', async () => {
    const { user } = section();

    await user.click(await screen.findByRole('button', { name: 'Scan' }));

    expect(await screen.findByText(/metadata: 3 matched, 0 unknown, 0 failed/)).toBeInTheDocument();
  });

  it('refreshes the metadata of a library', async () => {
    const { api, user } = section();

    await user.click(await screen.findByRole('button', { name: 'Refresh metadata' }));

    expect(api.enrich).toHaveBeenCalledWith('l1', true);
    expect(await screen.findByText(/Films refreshed: 2 matched, 1 unknown/)).toBeInTheDocument();
  });

  it('shows a busy refusal', async () => {
    const { user } = section({
      scan: vi.fn(() => Promise.resolve({ ok: false as const, error: 'scan_running' as const })),
    });

    await user.click(await screen.findByRole('button', { name: 'Scan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already running');
  });

  it('renames a library', async () => {
    const { api, user } = section();

    await user.click(await screen.findByRole('button', { name: 'Rename Films' }));
    const input = screen.getByLabelText('New name of Films');
    await user.clear(input);
    await user.type(input, 'Movies');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(api.renameLibrary).toHaveBeenCalledWith('l1', 'Movies');
  });

  it('deletes a library only once its name is typed', async () => {
    const { api, user } = section();

    await user.click(await screen.findByRole('button', { name: 'Delete Films' }));
    const confirm = screen.getByRole('button', { name: 'Delete Films and its catalog' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText('Type Films to confirm'), filmsLibrary.name);
    await user.click(confirm);

    expect(api.deleteLibrary).toHaveBeenCalledWith('l1');
  });

  it.each([
    ['root_unreadable', 'cannot read'],
    ['tmdb_not_configured', 'TMDB_API_KEY'],
    ['library_not_found', 'no longer exists'],
    ['invalid_request', 'absolute path'],
    ['forbidden', 'Only an owner'],
  ] as const)('explains %s', (code, text) => {
    expect(libraryMessage(code)).toContain(text);
  });
});
