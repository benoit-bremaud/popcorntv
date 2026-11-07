import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Media, WatchProgress } from '@popcorntv/shared';
import { artworkUrl, loadCatalog, loadProgress } from '../api.js';
import {
  availableGenres,
  availableTypes,
  catalogItems,
  continueWatchingRow,
  heroItem,
  ofType,
  seasonsOf,
  topRated,
} from './catalog.js';
import { CatalogBody } from './CatalogBody.js';
import type { OpenHandler } from './CatalogBody.js';
import { Controls } from './Controls.js';
import { DetailDialog } from './DetailDialog.js';
import { HOME, viewReducer } from './view-state.js';
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
};

/** UC3 / UC4: the catalog with its dynamic controls and the detail dialog. */
export function CatalogPage({
  profileId,
  load = loadCatalog,
  progress = loadProgress,
  onAddLibrary,
}: Props): React.JSX.Element {
  const [catalog, setCatalog] = useState<Load>({ kind: 'loading' });
  const [state, dispatch] = useReducer(viewReducer, HOME);
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

  const onClose = useCallback(
    (seq: number) => {
      setOpen((current) => (current?.seq === seq ? null : current));
      trigger.current?.focus();
      void fetchProgress();
    },
    [fetchProgress],
  );

  if (catalog.kind === 'loading') {
    return <p className="status muted">Loading the catalog…</p>;
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
    if (!onAddLibrary) return <p className="status muted">Nothing to watch yet.</p>;
    return (
      <section className="status" aria-labelledby="welcome-title">
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
  const hero = state.type === 'all' ? heroItem(items) : null;
  const heroBackdrop = hero?.metadata?.backdropPath ?? null;

  return (
    <>
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
      {open !== null && (
        <DetailDialog
          key={open.seq}
          item={open.item}
          seasons={seasonsOf(open.item, catalog.media)}
          profileId={profileId}
          progress={progress}
          onClose={() => onClose(open.seq)}
        />
      )}
    </>
  );
}
