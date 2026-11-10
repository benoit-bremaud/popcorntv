import { render, screen } from '@testing-library/react';
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
  });

  it('says the offers could not be loaded when the call fails', async () => {
    render(
      <WhereToWatch kind="movie" tmdbId={1} load={async () => Promise.reject(new Error('502'))} />,
    );

    expect(screen.getByText('Loading offers…')).toBeInTheDocument();
    expect(await screen.findByText('Offers could not be loaded.')).toBeInTheDocument();
  });
});
