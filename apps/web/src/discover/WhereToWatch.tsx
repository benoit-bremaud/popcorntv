import { useEffect, useState } from 'react';
import { COUNTING_OFFER_TYPES, WATCH_OFFER_TYPES } from '@popcorntv/shared';
import type { DiscoverKind, MyProvider, WatchOfferType, WatchProviders } from '@popcorntv/shared';
import { loadMyProviders, loadWatchProviders, logoUrl, setMyProvider } from '../api.js';

/** The "my providers" calls (UC29); injected by tests. */
export interface MyProvidersApi {
  readonly load: typeof loadMyProviders;
  readonly set: typeof setMyProvider;
}

const myProvidersApi: MyProvidersApi = { load: loadMyProviders, set: setMyProvider };

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
  /** The active profile: set, the block offers a "Mine" toggle per provider (UC29). */
  readonly profileId?: string;
  readonly myProviders?: MyProvidersApi;
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
  profileId,
  myProviders = myProvidersApi,
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
      {state.status === 'ready' && profileId !== undefined && (
        <MineToggles answer={state.answer} profileId={profileId} api={myProviders} />
      )}
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

/**
 * One "Mine" toggle per provider whose offer counts (spec wishlist-notifications R2, R3): a
 * My list title arriving on a provider marked mine raises a notification.
 */
function MineToggles({
  answer,
  profileId,
  api,
}: {
  readonly answer: WatchProviders;
  readonly profileId: string;
  readonly api: MyProvidersApi;
}): React.JSX.Element | null {
  const [mine, setMine] = useState<ReadonlySet<number> | null>(null);

  useEffect(() => {
    let live = true;
    void api.load(profileId).then((list) => {
      if (live) setMine(new Set(list.map((provider) => provider.providerId)));
    });
    return () => {
      live = false;
    };
  }, [api, profileId]);

  const providers = new Map<number, MyProvider>();
  for (const offer of answer.offers) {
    if (COUNTING_OFFER_TYPES.includes(offer.type)) {
      providers.set(offer.providerId, { providerId: offer.providerId, name: offer.name });
    }
  }
  if (mine === null || providers.size === 0) return null;

  async function toggle(provider: MyProvider, value: boolean): Promise<void> {
    if (!(await api.set(profileId, provider, value))) return;
    setMine((current) => {
      const next = new Set(current);
      if (value) next.add(provider.providerId);
      else next.delete(provider.providerId);
      return next;
    });
  }

  return (
    <div className="watch__mine">
      <p className="muted">My providers (notified when a My list title arrives):</p>
      <ul className="watch__offers">
        {[...providers.values()].map((provider) => {
          const pressed = mine.has(provider.providerId);
          return (
            <li key={provider.providerId}>
              <button
                type="button"
                className="chip"
                aria-pressed={pressed}
                onClick={() => void toggle(provider, !pressed)}
              >
                {provider.name}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
