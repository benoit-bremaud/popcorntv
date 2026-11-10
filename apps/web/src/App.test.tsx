import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@popcorntv/shared';
import { App } from './App.js';
import { media } from './test-fixtures.js';
import type { DiscoverApi } from './discover/discover-api.js';

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

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Nothing to watch yet.'),
    );
    expect(storage.getItem('popcorntv.activeProfileId')).toBe('k1');
    expect(screen.getByRole('button', { name: /^Kid, switch profile$/ })).toHaveFocus();
  });

  it('skips the picker for a remembered profile that still exists', async () => {
    const storage = memoryStorage({ 'popcorntv.activeProfileId': 'k1' });
    render(<App load={async () => [me, kid]} storage={storage} />);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Nothing to watch yet.'),
    );
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

  it('reloads the profiles before returning to the picker, and fails loudly', async () => {
    const load = vi
      .fn<() => Promise<Profile[]>>()
      .mockResolvedValueOnce([me, kid])
      .mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<App load={load} storage={memoryStorage()} />);

    await user.click(await screen.findByRole('button', { name: 'Manage profiles' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('switches to Discover and back to the library from "Play in my library" (UC26)', async () => {
    const user = userEvent.setup();
    const title = {
      kind: 'movie',
      tmdbId: 1,
      title: 'Dune',
      year: 2021,
      overview: '',
      voteAverage: 0,
      posterPath: null,
      mediaId: 'm1',
    } as const;
    const discover: DiscoverApi = {
      list: vi.fn(async () => [title]),
      search: vi.fn(async () => []),
      details: vi.fn(async () => Promise.reject(new Error('offline'))),
      wishlist: vi.fn(async () => []),
      setWishlisted: vi.fn(async () => true),
      providers: vi.fn(async () => ({ link: null, offers: [] })),
      titleLink: {
        load: vi.fn(async () => ({ url: null, editable: false })),
        save: vi.fn(async () => true),
      },
    };
    render(
      <App
        load={async () => [me]}
        storage={memoryStorage({ 'popcorntv.activeProfileId': 'default' })}
        discover={discover}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Discover' }));
    await user.click(
      (
        await screen.findAllByRole('button', { name: 'Dune (2021), in my library' })
      )[0] as HTMLElement,
    );
    await user.click(screen.getByRole('button', { name: 'Play in my library' }));

    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('opens the Discover title sheet of a notification line from the bell (UC28)', async () => {
    const user = userEvent.setup();
    const discover: DiscoverApi = {
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
      details: vi.fn(async () => Promise.reject(new Error('offline'))),
      wishlist: vi.fn(async () => []),
      setWishlisted: vi.fn(async () => true),
      providers: vi.fn(async () => ({ link: null, offers: [] })),
      titleLink: {
        load: vi.fn(async () => ({ url: null, editable: false })),
        save: vi.fn(async () => true),
      },
    };
    const notifications = {
      load: vi.fn(async () => ({
        items: [
          {
            id: 1,
            kind: 'movie',
            tmdbId: 7,
            title: 'Heat',
            reason: 'library',
            providerId: null,
            providerName: null,
            createdAt: '2026-11-10T00:00:00.000Z',
            readAt: null,
          } as const,
        ],
        unread: 1,
      })),
      markRead: vi.fn(async () => true),
    };
    render(
      <App
        load={async () => [me]}
        storage={memoryStorage({ 'popcorntv.activeProfileId': 'default' })}
        discover={discover}
        notifications={notifications}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(screen.getByRole('button', { name: 'Heat is now in your library' }));

    expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await screen.findByRole('dialog', { name: 'Heat' })).toBeInTheDocument();
    expect(discover.details).toHaveBeenCalledWith('movie', 7);
    expect(notifications.load).toHaveBeenCalledWith('default');
  });

  it('offers Play in my library on a notification line once the sheet knows the local match', async () => {
    const user = userEvent.setup();
    const heat = {
      kind: 'movie',
      tmdbId: 7,
      title: 'Heat',
      year: 1995,
      overview: '',
      voteAverage: 0,
      posterPath: null,
      mediaId: 'm1',
      genres: [],
      cast: [],
    } as const;
    const discover: DiscoverApi = {
      list: vi.fn(async () => []),
      search: vi.fn(async () => []),
      details: vi.fn(async () => heat),
      wishlist: vi.fn(async () => []),
      setWishlisted: vi.fn(async () => true),
      providers: vi.fn(async () => ({ link: null, offers: [] })),
      titleLink: {
        load: vi.fn(async () => ({ url: null, editable: false })),
        save: vi.fn(async () => true),
      },
    };
    const notifications = {
      load: vi.fn(async () => ({
        items: [
          {
            id: 1,
            kind: 'movie',
            tmdbId: 7,
            title: 'Heat',
            reason: 'library',
            providerId: null,
            providerName: null,
            createdAt: '2026-11-10T00:00:00.000Z',
            readAt: 'x',
          } as const,
        ],
        unread: 0,
      })),
      markRead: vi.fn(async () => true),
    };
    render(
      <App
        load={async () => [me]}
        storage={memoryStorage({ 'popcorntv.activeProfileId': 'default' })}
        discover={discover}
        notifications={notifications}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: 'Heat is now in your library' }));
    await user.click(await screen.findByRole('button', { name: 'Play in my library' }));

    expect(screen.getByRole('button', { name: 'Library' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps one history entry from the sheet to the detail on "Play in my library" (#169)', async () => {
    const user = userEvent.setup();
    const dune = media({ id: 'm1', title: 'Dune', libraryId: 'lib-1' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/libraries')) {
          return Response.json([{ id: 'lib-1', name: 'Films', rootPath: '/m', kind: 'films' }]);
        }
        if (url.endsWith('/libraries/lib-1/media')) return Response.json([dune]);
        return Response.json([]);
      }),
    );
    const title = {
      kind: 'movie',
      tmdbId: 1,
      title: 'Dune',
      year: 2021,
      overview: '',
      voteAverage: 0,
      posterPath: null,
      mediaId: 'm1',
    } as const;
    const discover: DiscoverApi = {
      list: vi.fn(async () => [title]),
      search: vi.fn(async () => []),
      details: vi.fn(async () => Promise.reject(new Error('offline'))),
      wishlist: vi.fn(async () => []),
      setWishlisted: vi.fn(async () => true),
      providers: vi.fn(async () => ({ link: null, offers: [] })),
      titleLink: {
        load: vi.fn(async () => ({ url: null, editable: false })),
        save: vi.fn(async () => true),
      },
    };
    render(
      <App
        load={async () => [me]}
        storage={memoryStorage({ 'popcorntv.activeProfileId': 'default' })}
        discover={discover}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Discover' }));
    await user.click(
      (
        await screen.findAllByRole('button', { name: 'Dune (2021), in my library' })
      )[0] as HTMLElement,
    );
    const push = vi.spyOn(history, 'pushState');

    await user.click(screen.getByRole('button', { name: 'Play in my library' }));

    expect(await screen.findByRole('dialog', { name: 'Dune' })).toBeInTheDocument();
    expect(history.state).toEqual({ pctvLayer: 1 });
    expect(push).not.toHaveBeenCalled();
    history.back();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dune' })).toBeNull());
    expect(history.state).toBeNull();
    push.mockRestore();
  });
});
