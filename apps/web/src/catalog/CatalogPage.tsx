import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Media, WatchProgress } from '@popcorntv/shared';
import { LiveStatus, useSettledMessage } from '../a11y/LiveStatus.js';
import { artworkUrl, loadCatalog, loadProgress } from '../api.js';
import type { PlaybackApi } from '../playback/PlayerDialog.js';
import {
  availableGenres,
  availableTypes,
  catalogItems,
  continueWatchingRow,
  watchedIds,
  heroItem,
  ofType,
  searchItems,
  seasonsOf,
  topRated,
} from './catalog.js';
import { CatalogBody } from './CatalogBody.js';
import type { OpenHandler } from './CatalogBody.js';
import { Controls } from './Controls.js';
import { DetailDialog } from './DetailDialog.js';
import { PosterGrid } from './PosterGrid.js';
import { SearchBox } from './SearchBox.js';
import { HOME, viewReducer } from './view-state.js';
import { WatchedContext } from './watched-context.js';
import type { CatalogView } from './view-state.js';

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; media: Media[] };

type Props = {
  /** The active profile (UC8); the detail dialog reads and saves its progress. */
  readonly profileId: string;
  /** Injected in tests; defaults to the real API. */
  readonly load?: () => Promise<Media[]>;
  /** `GET /profiles/:profileId/progress`; injected in tests (UC22). */
  readonly progress?: typeof loadProgress;
  /** Owners only: the empty catalog offers to add a library (spec library-management R7). */
  readonly onAddLibrary?: () => void;
  /** Opened once the catalog is loaded: Discover's "Play in my library" (UC26 R4). */
  readonly openMediaId?: string | null;
  /** The player's server calls, forwarded to the detail dialog; injected in tests. */
  readonly playback?: PlaybackApi;
};

/** UC3 / UC4: the catalog with its dynamic controls and the detail dialog. */
export function CatalogPage({
  profileId,
  load = loadCatalog,
  progress = loadProgress,
  onAddLibrary,
  openMediaId = null,
  playback,
}: Props): React.JSX.Element {
  const [catalog, setCatalog] = useState<Load>({ kind: 'loading' });
  const [state, dispatch] = useReducer(viewReducer, HOME);
  const [query, setQuery] = useState('');
  // `seq` numbers each opening: the native `close` event is queued as a task, so a late one
  // from a previous opening must not close a title reopened in the meantime.
  const [open, setOpen] = useState<{ item: Media; seq: number } | null>(null);
  const openings = useRef(0);
  const trigger = useRef<HTMLElement | null>(null);

  const latest = useRef(0);
  const [saved, setSaved] = useState<readonly WatchProgress[]>([]);
  const progressRequest = useRef(0);

  // UC22: only the latest progress request may set the row (spec continue-watching R7).
  const fetchProgress = useCallback(async () => {
    const request = ++progressRequest.current;
    const rows = await progress(profileId);
    if (request === progressRequest.current) setSaved(rows);
  }, [progress, profileId]);

  useEffect(() => {
    void fetchProgress();
  }, [fetchProgress]);

  // Only the latest request may settle the state (a quick Retry must not be overwritten).
  const fetchCatalog = useCallback(async () => {
    const request = ++latest.current;
    setCatalog({ kind: 'loading' });
    let next: Load;
    try {
      next = { kind: 'ready', media: await load() };
    } catch {
      next = { kind: 'failed' };
    }
    if (request === latest.current) setCatalog(next);
  }, [load]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  const onOpen = useCallback<OpenHandler>((item, element) => {
    trigger.current = element;
    openings.current += 1;
    setOpen({ item, seq: openings.current });
  }, []);

  // UC26: the title Discover asked for opens once, as soon as the catalog has it.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (catalog.kind !== 'ready' || openMediaId === null || opened.current === openMediaId) return;
    opened.current = openMediaId;
    const item = catalog.media.find((candidate) => candidate.id === openMediaId);
    if (item === undefined) return;
    openings.current += 1;
    setOpen({ item, seq: openings.current });
  }, [catalog, openMediaId]);

  const onClose = useCallback(
    (seq: number, lastSave: Promise<void>) => {
      setOpen((current) => (current?.seq === seq ? null : current));
      trigger.current?.focus();
      // R7: reload once the player's last save landed, or the row shows a stale position.
      void lastSave.then(fetchProgress);
    },
    [fetchProgress],
  );

  if (catalog.kind === 'loading') {
    return (
      <p className="status muted" role="status">
        Loading the catalog…
      </p>
    );
  }
  if (catalog.kind === 'failed') {
    return (
      <div className="status" role="alert">
        <p>The catalog could not be loaded.</p>
        <button type="button" className="button" onClick={() => void fetchCatalog()}>
          Retry
        </button>
      </div>
    );
  }

  const items = catalogItems(catalog.media);
  if (items.length === 0) {
    if (!onAddLibrary) {
      return (
        <p className="status muted" role="status">
          Nothing to watch yet.
        </p>
      );
    }
    return (
      <section className="status" role="status" aria-labelledby="welcome-title">
        <h2 id="welcome-title">Welcome to PopCornTV</h2>
        <p className="muted">Add a library from your media folder, then scan it.</p>
        <button type="button" className="button" onClick={onAddLibrary}>
          Add a library
        </button>
      </section>
    );
  }

  const types = availableTypes(items);
  const typed = state.type === 'all' ? items : ofType(items, state.type);
  const views: CatalogView[] =
    topRated(typed, 1).length > 0 ? ['genre', 'top-rated', 'a-z'] : ['genre', 'a-z'];
  const searching = query.trim() !== '';
  const results = searchItems(items, query);
  const hero = state.type === 'all' && !searching ? heroItem(items) : null;
  const heroBackdrop = hero?.metadata?.backdropPath ?? null;

  return (
    <WatchedContext value={watchedIds(catalog.media, saved)}>
      {hero !== null && heroBackdrop !== null && (
        <section className="hero">
          <img className="hero__image" src={artworkUrl(heroBackdrop)} alt="" />
          <div className="hero__body">
            <p className="hero__title">{hero.title}</p>
            {hero.metadata?.overview && <p className="hero__overview">{hero.metadata.overview}</p>}
            <button
              type="button"
              className="button"
              onClick={(event) => onOpen(hero, event.currentTarget)}
            >
              More info
            </button>
          </div>
        </section>
      )}
      <SearchBox query={query} onChange={setQuery} />
      <SearchStatus message={searching ? searchStatus(query.trim(), results.length) : ''} />
      {searching ? (
        <SearchResults query={query.trim()} items={results} onOpen={onOpen} />
      ) : (
        <>
          <Controls
            state={state}
            types={types}
            views={views}
            genres={availableGenres(typed)}
            dispatch={dispatch}
          />
          {/* Keyed by the view state: each new choice fades its content in. */}
          <div className="view" key={JSON.stringify(state)}>
            <CatalogBody
              items={items}
              state={state}
              onOpen={onOpen}
              continueWatching={continueWatchingRow(catalog.media, saved)}
            />
          </div>
        </>
      )}
      {open !== null && (
        <DetailDialog
          key={open.seq}
          item={open.item}
          seasons={seasonsOf(open.item, catalog.media)}
          profileId={profileId}
          progress={progress}
          api={playback}
          onClose={(lastSave) => onClose(open.seq, lastSave)}
        />
      )}
    </WatchedContext>
  );
}

type SearchResultsProps = {
  readonly query: string;
  readonly items: readonly Media[];
  readonly onOpen: (item: Media, trigger: HTMLElement) => void;
};

/** The announced search status: the result count, or that nothing matches (spec search R3). */
function searchStatus(query: string, count: number): string {
  if (count === 0) return `No match for “${query}”`;
  return `${count} ${count === 1 ? 'result' : 'results'} for “${query}”`;
}

/** Announces the status once typing pauses, so each keystroke is not read out (#165). */
function SearchStatus({ message }: { readonly message: string }): React.JSX.Element {
  return <LiveStatus message={useSettledMessage(message)} />;
}

/** UC24: the matching titles, or a visible "no match" line. */
function SearchResults({ query, items, onOpen }: SearchResultsProps): React.JSX.Element {
  if (items.length === 0) {
    return <p className="status muted">No title or person matches “{query}”.</p>;
  }
  return <PosterGrid title={`Results for “${query}”`} items={items} onOpen={onOpen} />;
}
