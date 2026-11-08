import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DiscoverTitle, WishlistEntry } from '@popcorntv/shared';
import type { DiscoverApi } from './discover-api.js';
import { DiscoverPage } from './DiscoverPage.js';

function title(overrides: Partial<DiscoverTitle> = {}): DiscoverTitle {
  return {
    kind: 'movie',
    tmdbId: 1,
    title: 'Dune',
    year: 2021,
    overview: 'Spice.',
    voteAverage: 7.8,
    posterPath: '/dune.jpg',
    mediaId: null,
    ...overrides,
  };
}

const DUNE = title();
const DARK = title({
  kind: 'tv',
  tmdbId: 2,
  title: 'Dark',
  year: null,
  posterPath: null,
  mediaId: 'm-dark',
});

function makeApi(overrides: Partial<DiscoverApi> = {}): DiscoverApi {
  return {
    list: vi.fn<DiscoverApi['list']>(async (list, kind) =>
      list === 'trending' && kind === 'movie' ? [DUNE] : kind === 'tv' ? [DARK] : [],
    ),
    search: vi.fn<DiscoverApi['search']>(async () => [DUNE]),
    details: vi.fn<DiscoverApi['details']>(async () => ({
      ...DUNE,
      genres: ['Science Fiction'],
      cast: ['Zendaya'],
    })),
    wishlist: vi.fn<DiscoverApi['wishlist']>(async () => []),
    setWishlisted: vi.fn<DiscoverApi['setWishlisted']>(async () => true),
    ...overrides,
  };
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('DiscoverPage', () => {
  it('shows the four TMDB rows and marks a title already on disk', async () => {
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi()} />);

    expect(
      await within(rowOf('Trending films')).findByRole('button', { name: 'Dune (2021)' }),
    ).toBeInTheDocument();
    expect(
      within(rowOf('Trending series')).getByRole('button', { name: 'Dark, in my library' }),
    ).toBeInTheDocument();
    expect(within(rowOf('Popular films')).getByText('Nothing to show.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'My list' })).not.toBeInTheDocument();
  });

  it('replaces a failed row by a muted line', async () => {
    const api = makeApi({ list: vi.fn(async () => Promise.reject(new Error('502'))) });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    expect(await screen.findAllByText('TMDB could not be reached.')).toHaveLength(4);
  });

  it('shows My list first, with Available once the title is on disk', async () => {
    const entry: WishlistEntry = { ...DARK, addedAt: '2026-11-07T10:00:00.000Z' };
    const api = makeApi({ wishlist: vi.fn(async () => [entry]) });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    const list = await screen.findByRole('region', { name: 'My list' });
    expect(within(list).getByRole('button', { name: 'Dark, available' })).toBeInTheDocument();
    expect(api.wishlist).toHaveBeenCalledWith('p1');
  });

  it('opens a sheet with genres and cast, and toggles the wishlist', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Dune (2021)' }));
    const sheet = screen.getByRole('dialog', { name: 'Dune' });
    expect(await within(sheet).findByText('Science Fiction')).toBeInTheDocument();
    expect(within(sheet).getByText('With Zendaya')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Play in my library' })).toBeNull();

    await user.click(within(sheet).getByRole('button', { name: '+ My list' }));

    expect(api.setWishlisted).toHaveBeenCalledWith('p1', 'movie', 1, true);
    expect(api.wishlist).toHaveBeenCalledTimes(2);
  });

  it('closes the sheet on browser Back and gives the focus back (#169)', async () => {
    const user = userEvent.setup();
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi()} />);
    const poster = await screen.findByRole('button', { name: 'Dune (2021)' });
    await user.click(poster);
    expect(history.state).toEqual({ pctvLayer: 1 });

    history.back();

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Dune' })).toBeNull());
    expect(history.state).toBeNull();
    expect(poster).toHaveFocus();
  });

  it('shows ✓ In my list for a listed title and removes it', async () => {
    const user = userEvent.setup();
    const entry: WishlistEntry = { ...DUNE, addedAt: '2026-11-07T10:00:00.000Z' };
    const api = makeApi({ wishlist: vi.fn(async () => [entry]) });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    const list = await screen.findByRole('region', { name: 'My list' });
    await user.click(within(list).getByRole('button', { name: 'Dune (2021)' }));
    const toggle = screen.getByRole('button', { name: '✓ In my list' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);

    expect(api.setWishlisted).toHaveBeenCalledWith('p1', 'movie', 1, false);
  });

  it('offers Play in my library for a title on disk', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    render(<DiscoverPage profileId="p1" onPlayInLibrary={onPlay} api={makeApi()} />);

    await user.click(
      await within(rowOf('Trending series')).findByRole('button', { name: 'Dark, in my library' }),
    );
    await user.click(screen.getByRole('button', { name: 'Play in my library' }));

    expect(onPlay).toHaveBeenCalledWith('m-dark');
  });

  it('searches TMDB on Enter and goes back to the rows when cleared', async () => {
    const user = userEvent.setup();
    const api = makeApi({ search: vi.fn(async () => []) });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    const field = screen.getByRole('searchbox', { name: 'Search TMDB titles' });
    await user.type(field, ' alien {Enter}');

    expect(api.search).toHaveBeenCalledWith('alien');
    expect(await screen.findByText('No title matches.')).toBeInTheDocument();
    await user.clear(field);
    expect(screen.getByRole('region', { name: 'Trending films' })).toBeInTheDocument();
  });
});
