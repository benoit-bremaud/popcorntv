import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverTitle, WishlistEntry } from '@popcorntv/shared';
import type { DiscoverApi } from './discover-api.js';
import { DiscoverPage, SEARCH_DEBOUNCE_MS } from './DiscoverPage.js';

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
    providers: vi.fn<DiscoverApi['providers']>(async () => ({ link: null, offers: [] })),
    ...overrides,
  };
}

function rowOf(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('DiscoverPage', () => {
  it('opts the search out of the browser identity autofill (#168)', () => {
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi()} />);

    const field = screen.getByRole('searchbox', { name: 'Search TMDB titles' });

    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).toHaveAttribute('name', 'q');
  });

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
    expect(within(sheet).getByText('Zendaya', { exact: false })).toHaveTextContent('Cast: Zendaya');
    expect(within(sheet).queryByText(/With /)).toBeNull();
    expect(within(sheet).queryByRole('button', { name: 'Play in my library' })).toBeNull();

    await user.click(within(sheet).getByRole('button', { name: '+ My list' }));

    expect(api.setWishlisted).toHaveBeenCalledWith('p1', 'movie', 1, true);
    expect(api.wishlist).toHaveBeenCalledTimes(2);
  });

  it('shows no cast line when TMDB gives no cast (#172)', async () => {
    const user = userEvent.setup();
    const api = makeApi({
      details: vi.fn<DiscoverApi['details']>(async () => ({
        ...DUNE,
        genres: ['Drama'],
        cast: [],
      })),
    });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    await user.click(await screen.findByRole('button', { name: 'Dune (2021)' }));
    const sheet = screen.getByRole('dialog', { name: 'Dune' });
    await within(sheet).findByText('Drama');

    expect(within(sheet).queryByText('Cast:')).toBeNull();
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
    expect(screen.getByRole('status')).toHaveTextContent('No match for “alien”');
    await user.clear(field);
    expect(screen.getByRole('region', { name: 'Trending films' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the result count of a search (#165)', async () => {
    const user = userEvent.setup();
    const api = makeApi({ search: vi.fn(async () => [DUNE, DARK]) });
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search TMDB titles' }), 'd{Enter}');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 results for “d”'));
  });

  it('announces one result in the singular (#165)', async () => {
    const user = userEvent.setup();
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi()} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search TMDB titles' }), 'dune{Enter}');

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('1 result for “dune”'),
    );
  });

  it('announces the search in flight, then a TMDB failure (#165)', async () => {
    const user = userEvent.setup();
    let fail: (error: Error) => void = () => undefined;
    const search = vi.fn(() => new Promise<DiscoverTitle[]>((_resolve, reject) => (fail = reject)));
    render(
      <DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi({ search })} />,
    );

    await user.type(screen.getByRole('searchbox', { name: 'Search TMDB titles' }), 'x{Enter}');

    expect(screen.getByRole('status')).toHaveTextContent('Searching for “x”…');
    fail(new Error('down'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('TMDB could not be reached.'),
    );
  });

  it('keeps the status empty on a blank search (#165)', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search TMDB titles' }), '   {Enter}');

    expect(api.search).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps the status empty before any search (#165)', () => {
    render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={makeApi()} />);

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  describe('live search (#166)', () => {
    afterEach(() => vi.useRealTimers());

    function setup(search: DiscoverApi['search'] = vi.fn(async () => [DUNE])) {
      vi.useFakeTimers();
      const api = makeApi({ search: vi.fn(search) });
      render(<DiscoverPage profileId="p1" onPlayInLibrary={() => undefined} api={api} />);
      const field = screen.getByRole('searchbox', { name: 'Search TMDB titles' });
      const type = (value: string): void => {
        fireEvent.change(field, { target: { value } });
      };
      return { type, api, field };
    }

    async function pause(ms = SEARCH_DEBOUNCE_MS): Promise<void> {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    }

    it('searches once typing pauses, without Enter', async () => {
      const { type, api } = setup();

      type('dune');
      expect(api.search).not.toHaveBeenCalled();
      await pause();

      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.search).toHaveBeenCalledWith('dune');
      expect(screen.getByRole('status')).toHaveTextContent('1 result for “dune”');
    });

    it('waits for the full pause before searching', async () => {
      const { type, api } = setup();

      type('dune');
      await pause(SEARCH_DEBOUNCE_MS - 1);

      expect(api.search).not.toHaveBeenCalled();
    });

    it('sends a single request for fast typing', async () => {
      const { type, api } = setup();

      type('du');
      await pause(SEARCH_DEBOUNCE_MS / 2);
      type('dune');
      await pause();

      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.search).toHaveBeenCalledWith('dune');
    });

    it('searches at once on Enter and does not repeat it after the pause', async () => {
      const { type, api, field } = setup();

      type('dune');
      fireEvent.submit(field);
      expect(api.search).toHaveBeenCalledTimes(1);
      await pause();

      expect(api.search).toHaveBeenCalledTimes(1);
    });

    it('ignores trailing spaces that do not change the query', async () => {
      const { type, api } = setup();

      type('dune');
      await pause();
      type('dune  ');
      await pause();

      expect(api.search).toHaveBeenCalledTimes(1);
    });

    it('never searches blank input', async () => {
      const { type, api } = setup();

      type('   ');
      await pause();

      expect(api.search).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.getByRole('region', { name: 'Trending films' })).toBeInTheDocument();
    });

    it('clears the field, the results and the status on Escape', async () => {
      const { type, api, field } = setup();

      type('dune');
      await pause();
      expect(screen.getByRole('region', { name: 'Results for “dune”' })).toBeInTheDocument();
      fireEvent.keyDown(field, { key: 'Escape' });
      await pause();

      expect(field).toHaveValue('');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.getByRole('region', { name: 'Trending films' })).toBeInTheDocument();
      expect(api.search).toHaveBeenCalledTimes(1);
    });

    it('searches the same text again after a clear', async () => {
      const { type, api, field } = setup();

      type('dune');
      await pause();
      fireEvent.keyDown(field, { key: 'Escape' });
      type('dune');
      await pause();

      expect(api.search).toHaveBeenCalledTimes(2);
    });

    it('drops a late answer for an earlier query', async () => {
      const answers: ((titles: DiscoverTitle[]) => void)[] = [];
      const { type } = setup(
        () => new Promise<DiscoverTitle[]>((resolve) => answers.push(resolve)),
      );

      type('da');
      await pause();
      type('dark');
      await pause();
      await act(async () => {
        answers[1]?.([DARK]);
        answers[0]?.([DUNE]);
      });

      expect(screen.getByRole('status')).toHaveTextContent('1 result for “dark”');
      expect(screen.queryByRole('button', { name: /Dune/ })).not.toBeInTheDocument();
    });

    it('lets Enter retry a query whose search failed', async () => {
      const search = vi
        .fn<DiscoverApi['search']>()
        .mockRejectedValueOnce(new Error('down'))
        .mockResolvedValue([DUNE]);
      const { type, api, field } = setup(search);

      type('dune');
      await pause();
      expect(screen.getByRole('status')).toHaveTextContent('TMDB could not be reached.');
      await act(async () => {
        fireEvent.submit(field);
      });

      expect(api.search).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('status')).toHaveTextContent('1 result for “dune”');
    });

    it('clears a failed search when the field is emptied', async () => {
      const { type } = setup(vi.fn(async () => Promise.reject(new Error('down'))));

      type('dune');
      await pause();
      type('');

      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.getByRole('region', { name: 'Trending films' })).toBeInTheDocument();
    });

    it('waits for an input method to finish composing', async () => {
      const { type, api, field } = setup();

      fireEvent.compositionStart(field);
      type('でゅ');
      await pause();
      expect(api.search).not.toHaveBeenCalled();
      type('デューン');
      fireEvent.compositionEnd(field);
      await pause();

      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.search).toHaveBeenCalledWith('デューン');
    });

    it('keeps the field on Escape while an input method composes', () => {
      const { type, field } = setup();

      type('dune');
      fireEvent.keyDown(field, { key: 'Escape', isComposing: true });

      expect(field).toHaveValue('dune');
    });
  });
});
