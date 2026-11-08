import { useEffect, useRef, useState } from 'react';
import type { DiscoverDetails, DiscoverTitle } from '@popcorntv/shared';
import { posterUrl } from '../api.js';
import type { DiscoverApi } from './discover-api.js';
import { useHistoryLayer } from '../history-layer.js';

type Props = {
  readonly title: DiscoverTitle;
  readonly profileId: string;
  readonly wishlisted: boolean;
  readonly api: DiscoverApi;
  /** Called after a wishlist change so My list reloads. */
  readonly onWishlistChanged: () => void;
  /** Opens the library's detail dialog of a title on disk (spec R4). */
  readonly onPlayInLibrary: (mediaId: string) => void;
  readonly onClose: () => void;
};

/** UC26 title sheet: a modal `<dialog>`; Escape or Close end it. */
export function TitleSheet({
  title,
  profileId,
  wishlisted,
  api,
  onWishlistChanged,
  onPlayInLibrary,
  onClose,
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // Back closes the layer; a close by button or Escape leaves its entry (ADR-0024).
  useHistoryLayer(ref);
  const [details, setDetails] = useState<DiscoverDetails | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
    // The list row already carries the basics; the sheet adds genres and cast when it can.
    api.details(title.kind, title.tmdbId).then(setDetails, () => undefined);
  }, []);

  async function toggle(): Promise<void> {
    setBusy(true);
    await api.setWishlisted(profileId, title.kind, title.tmdbId, !wishlisted);
    onWishlistChanged();
    setBusy(false);
  }

  const shown = details ?? title;
  const headingId = `discover-${title.kind}-${title.tmdbId}`;
  const facts = [
    shown.year === null ? null : String(shown.year),
    title.kind === 'movie' ? 'Film' : 'Series',
    shown.voteAverage > 0 ? `★ ${shown.voteAverage.toFixed(1)}` : null,
  ].filter((fact): fact is string => fact !== null);

  return (
    <dialog
      ref={ref}
      className="detail"
      aria-labelledby={headingId}
      onClose={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="detail__panel">
        <button
          type="button"
          className="detail__close"
          aria-label="Close"
          onClick={() => ref.current?.close()}
        >
          ×
        </button>
        <div className="detail__body sheet">
          {shown.posterPath !== null && (
            <img className="sheet__poster" src={posterUrl(shown.posterPath)} alt="" />
          )}
          <div>
            <h2 className="detail__title" id={headingId}>
              {shown.title}
            </h2>
            <p className="detail__facts">{facts.join(' · ')}</p>
            {title.mediaId !== null && <p className="sheet__badge">In my library</p>}
            {details !== null && details.genres.length > 0 && (
              <p className="detail__genres">{details.genres.join(', ')}</p>
            )}
            {shown.overview !== '' && <p>{shown.overview}</p>}
            {details !== null && details.cast.length > 0 && (
              <p className="muted">With {details.cast.join(', ')}</p>
            )}
            <div className="detail__actions">
              {title.mediaId !== null && (
                <button
                  type="button"
                  className="button"
                  onClick={() => title.mediaId !== null && onPlayInLibrary(title.mediaId)}
                >
                  Play in my library
                </button>
              )}
              <button
                type="button"
                className="chip"
                aria-pressed={wishlisted}
                disabled={busy}
                onClick={() => void toggle()}
              >
                {wishlisted ? '✓ In my list' : '+ My list'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
