import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@popcorntv/shared';
import { App } from './App.js';

const me: Profile = { id: 'default', name: 'Me', avatar: 'red' };
const kid: Profile = { id: 'k1', name: 'Kid', avatar: 'blue' };

/** A Map-backed `Storage`: jsdom's is shared between tests. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: () => null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

beforeEach(() => {
  // The catalog behind the active profile: empty libraries.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('[]', { status: 200 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it("asks who's watching, remembers the pick and opens the catalog", async () => {
    const storage = memoryStorage();
    const user = userEvent.setup();
    render(<App load={async () => [me, kid]} storage={storage} />);

    expect(screen.getByRole('heading', { name: 'PopCornTV', level: 1 })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Kid' }));

    expect(await screen.findByText(/Nothing to show yet/)).toBeInTheDocument();
    expect(storage.getItem('popcorntv.activeProfileId')).toBe('k1');
    expect(screen.getByRole('button', { name: /Kid, switch profile/ })).toBeInTheDocument();
  });

  it('skips the picker for a remembered profile that still exists', async () => {
    const storage = memoryStorage({ 'popcorntv.activeProfileId': 'k1' });
    render(<App load={async () => [me, kid]} storage={storage} />);

    expect(await screen.findByText(/Nothing to show yet/)).toBeInTheDocument();
    expect(screen.queryByText("Who's watching?")).not.toBeInTheDocument();
  });

  it('shows the picker when the remembered profile is gone, and on switch', async () => {
    const storage = memoryStorage({ 'popcorntv.activeProfileId': 'deleted' });
    const user = userEvent.setup();
    render(<App load={async () => [me]} storage={storage} />);

    await user.click(await screen.findByRole('button', { name: 'Me' }));
    await user.click(await screen.findByRole('button', { name: /switch profile/ }));

    expect(screen.getByRole('heading', { name: "Who's watching?" })).toHaveFocus();
  });

  it('offers a retry when the profiles cannot be loaded', async () => {
    const load = vi
      .fn<() => Promise<Profile[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([me]);
    const user = userEvent.setup();
    render(<App load={load} storage={memoryStorage()} />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('button', { name: 'Me' })).toBeInTheDocument();
  });

  it('manages profiles and returns to the refreshed picker', async () => {
    const load = vi
      .fn<() => Promise<Profile[]>>()
      .mockResolvedValueOnce([me])
      .mockResolvedValue([me, kid]);
    const create = vi.fn(async () => ({ ok: true, profile: kid }) as const);
    const user = userEvent.setup();
    render(
      <App
        load={load}
        storage={memoryStorage()}
        profileApi={{ create, update: vi.fn(), remove: vi.fn() }}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Manage profiles' }));
    await user.type(screen.getByRole('textbox', { name: 'Add a profile: name' }), 'Kid');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(create).toHaveBeenCalledWith({ name: 'Kid', avatar: 'blue' });
    expect(await screen.findByRole('button', { name: 'Kid' })).toBeInTheDocument();
  });
});
