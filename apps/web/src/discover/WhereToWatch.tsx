import { useEffect, useState } from 'react';
import { WATCH_OFFER_TYPES } from '@popcorntv/shared';
import type { DiscoverKind, WatchOfferType, WatchProviders } from '@popcorntv/shared';
import { loadWatchProviders, logoUrl } from '../api.js';

const TYPE_LABELS: Record<WatchOfferType, string> = {
  flatrate: 'Subscription',
  free: 'Free',
  ads: 'With ads',
  rent: 'Rent',
  buy: 'Buy',
};

type Props = {
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
  /** `GET /discover/:kind/:tmdbId/providers`; injected by tests. */
  readonly load?: typeof loadWatchProviders;
};

type State =
  | { readonly status: 'loading' | 'failed' }
  | { readonly status: 'ready'; readonly answer: WatchProviders };

/**
 * UC27 block: the French legal offers of a title, each opening the TMDB watch page in a new tab
 * (ADR-0029). PopCornTV never plays these streams (spec where-to-watch R8).
 */
export function WhereToWatch({
  kind,
  tmdbId,
  load = loadWatchProviders,
}: Props): React.JSX.Element {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load(kind, tmdbId).then(
      (answer) => live && setState({ status: 'ready', answer }),
      () => live && setState({ status: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [kind, tmdbId, load]);

  return (
    <section className="watch" aria-labelledby={`watch-${kind}-${tmdbId}`}>
      <h3 id={`watch-${kind}-${tmdbId}`}>Where to watch (France)</h3>
      {state.status === 'loading' && <p className="muted">Loading offers…</p>}
      {state.status === 'failed' && <p className="muted">Offers could not be loaded.</p>}
      {state.status === 'ready' && <Offers answer={state.answer} />}
    </section>
  );
}

function Offers({ answer }: { readonly answer: WatchProviders }): React.JSX.Element {
  const { link, offers } = answer;
  const credit = <p className="watch__credit muted">Data: JustWatch via TMDB</p>;
  if (link === null || offers.length === 0) {
    return (
      <>
        <p className="muted">No legal offer in France for now.</p>
        {credit}
      </>
    );
  }
  return (
    <>
      {WATCH_OFFER_TYPES.map((type) => {
        const group = offers.filter((offer) => offer.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type} className="watch__group">
            <h4 className="watch__type">{TYPE_LABELS[type]}</h4>
            <ul className="watch__offers">
              {group.map((offer) => (
                <li key={offer.providerId}>
                  <a
                    className="watch__offer"
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${offer.name} (opens in a new tab)`}
                  >
                    {offer.logoPath === null ? (
                      offer.name
                    ) : (
                      <img src={logoUrl(offer.logoPath)} alt={offer.name} loading="lazy" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {credit}
    </>
  );
}
