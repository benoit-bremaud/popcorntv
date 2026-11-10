import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WatchProviders } from '@popcorntv/shared';
import { WhereToWatch } from './WhereToWatch.js';

const LINK = 'https://www.themoviedb.org/movie/1/watch?locale=FR';

function answer(overrides: Partial<WatchProviders> = {}): WatchProviders {
  return {
    link: LINK,
    offers: [
      { providerId: 3, name: 'Google Play', logoPath: '/g.jpg', type: 'rent' },
      { providerId: 8, name: 'Netflix', logoPath: '/n.jpg', type: 'flatrate' },
      { providerId: 9, name: 'Arte', logoPath: null, type: 'free' },
    ],
    ...overrides,
  };
}

describe('WhereToWatch', () => {
  it('groups the offers by type in order, each opening the TMDB page in a new tab', async () => {
    const load = vi.fn(async () => answer());

    render(<WhereToWatch kind="movie" tmdbId={1} load={load} />);

    const netflix = await screen.findByRole('link', { name: 'Netflix' });
    expect(netflix).toHaveAttribute('href', LINK);
    expect(netflix).toHaveAttribute('target', '_blank');
    expect(netflix).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('img', { name: 'Netflix' })).toHaveAttribute(
      'src',
      '/api/discover/logo/n.jpg',
    );
    expect(screen.getByRole('link', { name: 'Arte' })).toHaveTextContent('Arte');
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Subscription',
      'Free',
      'Rent',
    ]);
    expect(screen.getByText('Data: JustWatch via TMDB')).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('movie', 1);
  });

  it.each([
    ['no offer', answer({ offers: [] })],
    ['no link', answer({ link: null })],
  ])('says there is no legal offer when TMDB has %s', async (_label, value) => {
    render(<WhereToWatch kind="tv" tmdbId={2} load={async () => value} />);

    expect(await screen.findByText('No legal offer in France for now.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Data: JustWatch via TMDB')).toBeInTheDocument();
  });

  it('says the offers could not be loaded when the call fails', async () => {
    render(
      <WhereToWatch kind="movie" tmdbId={1} load={async () => Promise.reject(new Error('502'))} />,
    );

    expect(screen.getByText('Loading offers…')).toBeInTheDocument();
    expect(await screen.findByText('Offers could not be loaded.')).toBeInTheDocument();
  });
});

describe('WhereToWatch — my providers (UC29)', () => {
  function mineApi(initial: number[] = [9], ok = true) {
    return {
      load: vi.fn(async () =>
        initial.map((providerId) => ({ providerId, name: `P${providerId}` })),
      ),
      set: vi.fn(async () => ok),
    };
  }

  it('offers a toggle per subscription, free or ads provider, pressed when mine', async () => {
    const api = mineApi();
    render(
      <WhereToWatch
        kind="movie"
        tmdbId={1}
        load={async () => answer()}
        profileId="p1"
        myProviders={api}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Arte' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('button', { name: 'Google Play' })).toBeNull();
    expect(api.load).toHaveBeenCalledWith('p1');
  });

  it('marks and unmarks a provider as mine', async () => {
    const user = userEvent.setup();
    const api = mineApi();
    render(
      <WhereToWatch
        kind="movie"
        tmdbId={1}
        load={async () => answer()}
        profileId="p1"
        myProviders={api}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Netflix' }));
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Arte' }));
    expect(screen.getByRole('button', { name: 'Arte' })).toHaveAttribute('aria-pressed', 'false');
    expect(api.set.mock.calls).toEqual([
      ['p1', { providerId: 8, name: 'Netflix' }, true],
      ['p1', { providerId: 9, name: 'Arte' }, false],
    ]);
  });

  it('keeps the toggle as it was when the server refuses', async () => {
    const user = userEvent.setup();
    const api = mineApi([], false);
    render(
      <WhereToWatch
        kind="movie"
        tmdbId={1}
        load={async () => answer()}
        profileId="p1"
        myProviders={api}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Netflix' }));
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows no toggle without a profile or without a counting offer', async () => {
    const api = mineApi();
    const { unmount } = render(
      <WhereToWatch kind="movie" tmdbId={1} load={async () => answer()} myProviders={api} />,
    );
    await screen.findByRole('link', { name: 'Netflix' });
    expect(screen.queryByRole('button')).toBeNull();
    expect(api.load).not.toHaveBeenCalled();
    unmount();

    const rentOnly = answer({
      offers: [{ providerId: 3, name: 'Google Play', logoPath: null, type: 'rent' }],
    });
    render(
      <WhereToWatch
        kind="movie"
        tmdbId={1}
        load={async () => rentOnly}
        profileId="p1"
        myProviders={api}
      />,
    );
    await screen.findByRole('link', { name: 'Google Play' });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
