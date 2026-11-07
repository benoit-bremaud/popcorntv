import { useContext } from 'react';
import type { Media } from '@popcorntv/shared';
import { artworkUrl } from '../api.js';
import { WatchedContext } from './watched-context.js';

type Props = {
  readonly item: Media;
  readonly onOpen: (item: Media, trigger: HTMLElement) => void;
  /** Watched fraction (0–1); a native `<progress>` is drawn when it is above 0. */
  readonly progress?: number;
};

/** One poster; a button so it is reachable and activable by keyboard (UC4 step 1). */
export function PosterCard({ item, onOpen, progress }: Props): React.JSX.Element {
  const poster = item.metadata?.posterPath ?? null;
  const rating = item.metadata?.voteAverage ?? null;
  const seen = useContext(WatchedContext).has(item.id);
  const title = item.year === null ? item.title : `${item.title} (${item.year})`;
  const name = seen ? `${title}, watched` : title;
  const watched = progress !== undefined && progress > 0 ? Math.round(progress * 100) : 0;
  return (
    <button
      type="button"
      className="poster"
      aria-label={watched > 0 ? `${name}, ${watched}% watched` : name}
      onClick={(event) => onOpen(item, event.currentTarget)}
    >
      {poster === null ? (
        <span className="poster__placeholder" aria-hidden="true">
          {item.title}
        </span>
      ) : (
        <img className="poster__image" src={artworkUrl(poster)} alt="" loading="lazy" />
      )}
      {seen && (
        <span className="poster__watched" aria-hidden="true">
          ✓
        </span>
      )}
      {rating !== null && (
        <span className="poster__rating" aria-hidden="true">
          ★ {rating.toFixed(1)}
        </span>
      )}
      {watched > 0 && (
        <progress className="poster__progress" max={1} value={progress} aria-hidden="true" />
      )}
    </button>
  );
}
