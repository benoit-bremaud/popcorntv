import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Media, WatchProgress } from '@popcorntv/shared';
import { ACTION, DOCUMENTARY, DRAMA, media, metadata } from '../test-fixtures.js';
import type { PlaybackApi } from '../playback/PlayerDialog.js';
import { CatalogPage } from './CatalogPage.js';

const heat = media({
  id: 'heat',
  title: 'Heat',
  year: 1995,
  metadata: metadata({
    genres: [ACTION, DRAMA],
    voteAverage: 8.3,
    voteCount: 7000,
    runtimeMin: 170,
    posterPath: 'heat-poster.jpg',
    backdropPath: 'heat-backdrop.jpg',
    overview: 'A cop chases a thief.',
    cast: [{ name: 'Al Pacino', character: 'Hanna', profilePath: null }],
  }),
});
const alien = media({ id: 'alien', title: 'Alien', metadata: metadata({ genres: [ACTION] }) });
const dark = media({ id: 'dark', title: 'Dark', kind: 'series' });
const pilot = media({
  id: 'pilot',
  title: 'Secrets',
  kind: 'episode',
  seriesId: 'dark',
  season: 1,
  episode: 1,
});
const planet = media({
  id: 'planet',
  title: 'Planet',
  metadata: metadata({ genres: [DOCUMENTARY] }),
});

const CATALOG: Media[] = [heat, alien, dark, pilot, planet];

function renderPage(
  load: () => Promise<Media[]> = async () => CATALOG,
  progress: () => Promise<WatchProgress[]> = async () => [],
) {
  return {
    user: userEvent.setup(),
    ...render(<CatalogPage profileId="default" load={load} progress={progress} />),
  };
}

function group(name: string): HTMLElement {
  return screen.getByRole('group', { name });
}

describe('CatalogPage', () => {
  it('opens the title Discover asked for once the catalog is loaded (UC26)', async () => {
    render(
      <CatalogPage
        profileId="default"
        load={async () => CATALOG}
        progress={async () => []}
        openMediaId="heat"
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Heat' })).toBeInTheDocument();
  });

  it('shows the home view: hero, top rated, type rows and genre rows', async () => {
    renderPage();

    expect(await screen.findByRole('button', { name: 'More info' })).toBeInTheDocument();
    expect(screen.getByText('A cop chases a thief.')).toBeInTheDocument();
    const rowTitles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(rowTitles).toEqual(['Top rated', 'Films', 'Series', 'Documentaries', 'Action', 'Drama']);
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
    expect(
      within(group('Type'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['All', 'Films', 'Series', 'Documentaries']);
  });

  it('renders the rows without inline styles (strict style-src CSP)', async () => {
    const { container } = renderPage(undefined, async () => [
      {
        mediaId: 'alien',
        positionSec: 600,
        durationSec: 1200,
        finished: false,
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
    ]);
    await screen.findByRole('region', { name: 'Continue watching' });

    await screen.findByRole('button', { name: 'More info' });
    expect(container.querySelectorAll('.row')).not.toHaveLength(0);
    expect(container.querySelectorAll('[style]')).toHaveLength(0);
  });

  it('reveals views, then genres, as choices are made (progressive disclosure)', async () => {
    const { user } = renderPage();

    await user.click(
      await within(await screen.findByRole('group', { name: 'Type' })).findByRole('button', {
        name: 'Films',
      }),
    );
    expect(
      within(group('View'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['By genre', 'Top rated', 'A–Z']);
    expect(
      within(group('Genre'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Action', 'Drama']);

    await user.click(within(group('Genre')).getByRole('button', { name: 'Drama' }));
    expect(screen.getByRole('region', { name: 'Films — Drama' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Heat/ })).toHaveLength(1);

    await user.click(within(group('View')).getByRole('button', { name: 'A–Z' }));
    expect(screen.queryByRole('group', { name: 'Genre' })).not.toBeInTheDocument();
    const grid = screen.getByRole('region', { name: 'Films — A–Z' });
    expect(
      within(grid)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Alien', 'Heat (1995)']);

    await user.click(within(group('View')).getByRole('button', { name: 'Top rated' }));
    expect(screen.getByRole('region', { name: 'Films — top rated' })).toBeInTheDocument();

    await user.click(within(group('Type')).getByRole('button', { name: 'All' }));
    expect(screen.queryByRole('group', { name: 'View' })).not.toBeInTheDocument();
  });

  it('hides Top rated for a type without ratings and keeps titles without genre reachable', async () => {
    const { user } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'Series' }));
    expect(
      within(group('View'))
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['By genre', 'A–Z']);
    expect(screen.queryByRole('group', { name: 'Genre' })).not.toBeInTheDocument();
    const others = screen.getByRole('region', { name: 'Other titles' });
    expect(within(others).getByRole('button', { name: 'Dark' })).toBeInTheDocument();
  });

  it('opens a title in a dialog and returns focus to its poster on close', async () => {
    const { user } = renderPage();

    const poster = (await screen.findAllByRole('button', { name: 'Heat (1995)' }))[0];
    if (poster === undefined) throw new Error('poster missing');
    await user.click(poster);
    const dialog = screen.getByRole('dialog', { name: 'Heat' });
    expect(within(dialog).getByText('1995 · 170 min · ★ 8.3')).toBeInTheDocument();
    expect(within(dialog).getByText('A cop chases a thief.')).toBeInTheDocument();
    expect(within(dialog).getByText('Al Pacino')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(poster).toHaveFocus();
  });

  it('lists the episodes of a series and closes on the native close event', async () => {
    const { user } = renderPage();

    await user.click((await screen.findAllByRole('button', { name: 'Dark' }))[0] as HTMLElement);
    const dialog = screen.getByRole('dialog', { name: 'Dark' });
    expect(within(dialog).getByRole('heading', { name: 'Season 1' })).toBeInTheDocument();
    expect(within(dialog).getByText('Secrets')).toBeInTheDocument();
    expect(within(dialog).getByText('No synopsis yet.')).toBeInTheDocument();

    (dialog as HTMLDialogElement).close();
    expect(await screen.findByRole('heading', { name: 'Top rated' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the hero title and gives the focus back to its button', async () => {
    const { user } = renderPage();

    const moreInfo = await screen.findByRole('button', { name: 'More info' });
    await user.click(moreInfo);
    const dialog = screen.getByRole('dialog', { name: 'Heat' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(moreInfo).toHaveFocus();
  });

  it('ignores a stale load that settles after a newer one', async () => {
    let settleOld: (media: Media[]) => void = () => undefined;
    const oldLoad = () =>
      new Promise<Media[]>((resolve) => {
        settleOld = resolve;
      });
    const { rerender } = render(<CatalogPage profileId="default" load={oldLoad} />);

    rerender(<CatalogPage profileId="default" load={async () => CATALOG} />);
    expect(await screen.findByRole('heading', { name: 'Top rated' })).toBeInTheDocument();
    settleOld([]);

    expect(await screen.findByRole('heading', { name: 'Top rated' })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing to watch yet/)).not.toBeInTheDocument();
  });

  it('shows an error with a working Retry', async () => {
    const load = vi
      .fn<() => Promise<Media[]>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(CATALOG);
    const { user } = renderPage(load);

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Top rated' })).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state when no library has items', async () => {
    renderPage(async () => [pilot]);

    expect(await screen.findByText(/Nothing to watch yet/)).toBeInTheDocument();
  });

  it('offers a viewer nothing to add when the catalog is empty', async () => {
    render(<CatalogPage profileId="default" load={async () => []} />);

    expect(await screen.findByText('Nothing to watch yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a library' })).toBeNull();
  });

  it('offers an owner to add a library when the catalog is empty', async () => {
    const user = userEvent.setup();
    const onAddLibrary = vi.fn();
    render(<CatalogPage profileId="default" load={async () => []} onAddLibrary={onAddLibrary} />);

    await user.click(await screen.findByRole('button', { name: 'Add a library' }));

    expect(onAddLibrary).toHaveBeenCalledOnce();
  });

  it('shows the poster placeholder without artwork and the image with it', async () => {
    renderPage();

    const alienPoster = (await screen.findAllByRole('button', { name: 'Alien' }))[0] as HTMLElement;
    expect(alienPoster).toHaveTextContent('Alien');
    const heatPoster = screen.getAllByRole('button', { name: 'Heat (1995)' })[0] as HTMLElement;
    expect(heatPoster.querySelector('img')).toHaveAttribute('src', '/api/artwork/heat-poster.jpg');
  });
});

describe('CatalogPage continue watching', () => {
  const inProgress: WatchProgress = {
    mediaId: 'alien',
    positionSec: 600,
    durationSec: 1200,
    finished: false,
    updatedAt: '2026-11-07T00:00:00.000Z',
  };

  it('should show the row first on the home view', async () => {
    renderPage(undefined, async () => [inProgress]);

    const row = await screen.findByRole('region', { name: 'Continue watching' });
    expect(within(row).getByRole('button', { name: 'Alien, 50% watched' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')[0]).toBe(row);
    expect(row.querySelector('progress')).toHaveAttribute('value', '0.5');
    expect(document.querySelectorAll('progress')).toHaveLength(1);
  });

  it('should hide the row when nothing is in progress', async () => {
    renderPage();

    await screen.findByRole('region', { name: 'Top rated' });
    expect(screen.queryByRole('region', { name: 'Continue watching' })).toBeNull();
  });

  it('should reload the progress when the detail dialog closes', async () => {
    const progress = vi.fn(async () => [inProgress]);
    const { user } = renderPage(undefined, progress);
    const row = await screen.findByRole('region', { name: 'Continue watching' });

    await user.click(within(row).getByRole('button', { name: 'Alien, 50% watched' }));
    const dialog = await screen.findByRole('dialog');
    const before = progress.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    expect(progress).toHaveBeenCalledTimes(before + 1);
  });

  /** A server double whose saves stay pending until `land` is called (#140). */
  function slowSaves(): { api: PlaybackApi; land: () => void } {
    let resolve: () => void = () => undefined;
    const pending = new Promise<void>((done) => {
      resolve = done;
    });
    return {
      api: {
        start: async ({ mediaId, startSec = 0 }) => ({
          mode: 'direct',
          url: `/api/media/${mediaId}/file`,
          mime: 'video/mp4',
          startSec,
          offsetSec: 0,
        }),
        heartbeat: async () => undefined,
        stop: async () => undefined,
        save: () => pending,
      },
      land: () => resolve(),
    };
  }

  /** Opens Alien from the row, plays it, then closes the player and the detail. */
  async function watchAndClose(progress: () => Promise<WatchProgress[]>, api: PlaybackApi) {
    const user = userEvent.setup();
    const playable: Media = {
      ...alien,
      streams: [{ type: 'video', codec: 'h264', width: 1920, height: 1080, language: null }],
    };
    render(
      <CatalogPage
        profileId="default"
        load={async () => CATALOG.map((item) => (item.id === 'alien' ? playable : item))}
        progress={progress}
        playback={api}
      />,
    );
    const row = await screen.findByRole('region', { name: 'Continue watching' });
    await user.click(within(row).getByRole('button', { name: 'Alien, 50% watched' }));
    const detail = await screen.findByRole('dialog', { name: 'Alien' });
    await user.click(await within(detail).findByRole('button', { name: /Resume|Play/ }));
    const player = await screen.findByRole('dialog', { name: 'Playing Alien' });
    await waitFor(() => expect(player.querySelector('video')).not.toBeNull());
    fireEvent.loadedMetadata(player.querySelector('video') as HTMLVideoElement);
    await user.click(within(player).getByRole('button', { name: 'Close player' }));
    await user.click(within(detail).getByRole('button', { name: 'Close' }));
    return user;
  }

  it("should reload the row only once the player's last save landed (#140)", async () => {
    const later = { ...inProgress, positionSec: 900 };
    let rows: WatchProgress[] = [inProgress];
    const progress = vi.fn(async () => rows);
    const { api, land } = slowSaves();
    await watchAndClose(progress, api);
    const before = progress.mock.calls.length;

    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
    expect(progress).toHaveBeenCalledTimes(before);

    rows = [later];
    await act(async () => {
      land();
    });

    expect(await screen.findByRole('button', { name: 'Alien, 75% watched' })).toBeInTheDocument();
  });

  it('should keep the newer row when a stale reload answers last', async () => {
    let answer: (rows: WatchProgress[]) => void = () => undefined;
    const progress = vi
      .fn<() => Promise<WatchProgress[]>>()
      .mockResolvedValueOnce([inProgress])
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            answer = done;
          }),
      )
      .mockResolvedValue([{ ...inProgress, positionSec: 900 }]);
    const user = userEvent.setup();
    render(<CatalogPage profileId="default" load={async () => CATALOG} progress={progress} />);
    const row = await screen.findByRole('region', { name: 'Continue watching' });

    for (let round = 0; round < 2; round += 1) {
      await user.click(within(row).getByRole('button', { name: /Alien, \d+% watched/ }));
      await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Close' }),
      );
    }
    await screen.findByRole('button', { name: 'Alien, 75% watched' });
    await act(async () => {
      answer([]);
    });

    expect(screen.getByRole('button', { name: 'Alien, 75% watched' })).toBeInTheDocument();
  });
});

describe('CatalogPage watched marks', () => {
  it('should name a watched poster as watched', async () => {
    renderPage(undefined, async () => [
      {
        mediaId: 'alien',
        positionSec: 0,
        durationSec: null,
        finished: true,
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
    ]);

    expect(
      (await screen.findAllByRole('button', { name: 'Alien, watched' })).length,
    ).toBeGreaterThan(0);
  });
});

describe('CatalogPage search (spec search)', () => {
  it('should show the matching titles and people, then clear with Escape', async () => {
    const { user } = renderPage();
    const box = await screen.findByRole('searchbox', { name: 'Search titles and people' });

    await user.type(box, 'pacino');

    const results = screen.getByRole('region', { name: 'Results for “pacino”' });
    expect(within(results).getByRole('button', { name: 'Heat (1995)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More info' })).toBeNull();

    await user.keyboard('{Escape}');

    expect(box).toHaveValue('');
    expect(await screen.findByRole('button', { name: 'More info' })).toBeInTheDocument();
  });

  it('should say when nothing matches', async () => {
    const { user } = renderPage();

    await user.type(await screen.findByRole('searchbox'), 'zzz');

    expect(screen.getByRole('status')).toHaveTextContent('No match');
    expect(screen.getByText(/No title or person matches/)).toBeInTheDocument();
  });
});
