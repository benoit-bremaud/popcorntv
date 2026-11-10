import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscoverKind, DiscoverList, DiscoverTitle, WishlistEntry } from '@popcorntv/shared';
import { LiveStatus } from '../a11y/LiveStatus.js';
import { DiscoverCard } from './DiscoverCard.js';
import { discoverApi } from './discover-api.js';
import type { DiscoverApi } from './discover-api.js';
import { TitleSheet } from './TitleSheet.js';

/** Pause after the last keystroke before the Discover search goes out (spec R2, #166). */
export const SEARCH_DEBOUNCE_MS = 400;

/** The four TMDB rows (spec discover-wishlist R1). */
export const DISCOVER_ROWS: readonly {
  readonly list: DiscoverList;
  readonly kind: DiscoverKind;
  readonly title: string;
}[] = [
  { list: 'trending', kind: 'movie', title: 'Trending films' },
  { list: 'trending', kind: 'tv', title: 'Trending series' },
  { list: 'popular', kind: 'movie', title: 'Popular films' },
  { list: 'popular', kind: 'tv', title: 'Popular series' },
];

type RowState = readonly DiscoverTitle[] | 'loading' | 'failed';
type OpenHandler = (title: DiscoverTitle, trigger: HTMLElement) => void;

type Props = {
  readonly profileId: string;
  /** Opens a title on disk in the library (spec R4). */
  readonly onPlayInLibrary: (mediaId: string) => void;
  /** Injected in tests; defaults to the real API. */
  readonly api?: DiscoverApi;
  /** A title to open at once (a notification line, UC28 R11). */
  readonly openTitle?: DiscoverTitle | null;
};

/** One TMDB row, or `failed` when the server refused or was unreachable (spec R9). */
async function loadRow(
  api: DiscoverApi,
  list: DiscoverList,
  kind: DiscoverKind,
): Promise<RowState> {
  try {
    return await api.list(list, kind);
  } catch {
    return 'failed';
  }
}

/** `rows` with the row at `index` replaced. */
function replaceAt(rows: readonly RowState[], index: number, state: RowState): readonly RowState[] {
  return rows.map((row, at) => (at === index ? state : row));
}

/** Key of a title in the wishlist lookup. */
export function titleKey(title: Pick<DiscoverTitle, 'kind' | 'tmdbId'>): string {
  return `${title.kind}:${title.tmdbId}`;
}

/** UC26: My list, the TMDB rows, a search, and the title sheet. */
export function DiscoverPage({
  profileId,
  onPlayInLibrary,
  api = discoverApi,
  openTitle = null,
}: Props): React.JSX.Element {
  const [rows, setRows] = useState<readonly RowState[]>(DISCOVER_ROWS.map(() => 'loading'));
  const [wishlist, setWishlist] = useState<readonly WishlistEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; titles: RowState } | null>(null);
  /** True while an input method composes, so half-typed text is never sent. */
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<DiscoverTitle | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const wishlistRequest = useRef(0);
  /**
   * The trimmed query last sent (or cleared), so Enter and the debounce never repeat it;
   * `null` after a failure, so Enter retries it.
   */
  const sent = useRef<string | null>('');

  const refreshWishlist = useCallback(async () => {
    const request = ++wishlistRequest.current;
    const entries = await api.wishlist(profileId);
    if (request === wishlistRequest.current) setWishlist(entries);
  }, [api, profileId]);

  useEffect(() => {
    void refreshWishlist();
    DISCOVER_ROWS.forEach(({ list, kind }, index) => {
      void loadRow(api, list, kind).then((state) =>
        setRows((current) => replaceAt(current, index, state)),
      );
    });
  }, [api, refreshWishlist]);

  useEffect(() => {
    if (openTitle !== null) setOpen(openTitle);
  }, [openTitle]);

  const onOpen = useCallback<OpenHandler>((title, element) => {
    trigger.current = element;
    setOpen(title);
  }, []);

  const search = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (text === sent.current) return;
      sent.current = text;
      if (text === '') {
        setResults(null);
        return;
      }
      setResults({ query: text, titles: 'loading' });
      let titles: RowState;
      try {
        titles = await api.search(text);
      } catch {
        titles = 'failed';
        if (sent.current === text) sent.current = null;
      }
      setResults((current) => (current?.query === text ? { query: text, titles } : current));
    },
    [api],
  );

  // Live search like the library one (#166): the query goes out once typing pauses.
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => void search(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, composing, search]);

  const listed = new Set(wishlist.map(titleKey));

  return (
    <>
      <search className="search">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search(query);
          }}
        >
          <input
            type="search"
            maxLength={100}
            className="search__input"
            name="q"
            autoComplete="off"
            aria-label="Search TMDB titles"
            placeholder="Search films and series to discover"
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              if (value.trim() === '') void search('');
            }}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
                setQuery('');
                void search('');
              }
            }}
          />
        </form>
      </search>
      <LiveStatus message={results === null ? '' : resultsStatus(results.query, results.titles)} />
      {results !== null ? (
        <TitleRow
          id="discover-results"
          title={`Results for “${results.query}”`}
          state={results.titles}
          empty="No title matches."
          onOpen={onOpen}
        />
      ) : (
        <div className="view">
          {wishlist.length > 0 && (
            <TitleRow
              id="discover-wishlist"
              title="My list"
              state={wishlist}
              availableLabel="Available"
              onOpen={onOpen}
            />
          )}
          {DISCOVER_ROWS.map((row, index) => (
            <TitleRow
              key={`${row.list}-${row.kind}`}
              id={`discover-${row.list}-${row.kind}`}
              title={row.title}
              state={rows[index] ?? 'loading'}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
      {open !== null && (
        <TitleSheet
          key={titleKey(open)}
          title={open}
          profileId={profileId}
          wishlisted={listed.has(titleKey(open))}
          api={api}
          onWishlistChanged={() => void refreshWishlist()}
          onPlayInLibrary={onPlayInLibrary}
          onClose={() => {
            setOpen(null);
            trigger.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** The announced Discover search status (spec discover-wishlist R2, #165). */
function resultsStatus(query: string, titles: RowState): string {
  if (titles === 'loading') return `Searching for “${query}”…`;
  if (titles === 'failed') return 'TMDB could not be reached.';
  if (titles.length === 0) return `No match for “${query}”`;
  return `${titles.length} ${titles.length === 1 ? 'result' : 'results'} for “${query}”`;
}

type TitleRowProps = {
  readonly id: string;
  readonly title: string;
  readonly state: RowState;
  readonly onOpen: OpenHandler;
  readonly empty?: string;
  readonly availableLabel?: string;
};

/** A titled shelf of Discover posters, or a muted line while loading or on failure (R9). */
function TitleRow({
  id,
  title,
  state,
  onOpen,
  empty = 'Nothing to show.',
  availableLabel,
}: TitleRowProps): React.JSX.Element {
  let body: React.JSX.Element;
  if (state === 'loading') body = <p className="muted">Loading…</p>;
  else if (state === 'failed') body = <p className="muted">TMDB could not be reached.</p>;
  else if (state.length === 0) body = <p className="muted">{empty}</p>;
  else {
    body = (
      <ul className="row__track">
        {state.map((item) => (
          <li key={titleKey(item)}>
            <DiscoverCard title={item} onOpen={onOpen} availableLabel={availableLabel} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section className="row" aria-labelledby={id}>
      <h2 className="row__title" id={id}>
        {title}
      </h2>
      {body}
    </section>
  );
}
