import type { Media } from '@popcorntv/shared';
import { artworkUrl } from '../api.js';

type Props = {
  readonly item: Media;
  readonly onOpen: (item: Media, trigger: HTMLElement) => void;
  /** Watched fraction (0–1); a progress bar is drawn when it is above 0. */
  readonly progress?: number | undefined;
};

/** One poster; a button so it is reachable and activable by keyboard (UC4 step 1). */
export function PosterCard({ item, onOpen, progress }: Props): React.JSX.Element {
  const poster = item.metadata?.posterPath ?? null;
  const rating = item.metadata?.voteAverage ?? null;
  return (
    <button
      type="button"
      className="poster"
      aria-label={item.year === null ? item.title : `${item.title} (${item.year})`}
      onClick={(event) => onOpen(item, event.currentTarget)}
    >
      {poster === null ? (
        <span className="poster__placeholder" aria-hidden="true">
          {item.title}
        </span>
      ) : (
        <img className="poster__image" src={artworkUrl(poster)} alt="" loading="lazy" />
      )}
      {rating !== null && (
        <span className="poster__rating" aria-hidden="true">
          ★ {rating.toFixed(1)}
        </span>
      )}
      {progress !== undefined && progress > 0 && (
        <span className="poster__progress" aria-hidden="true">
          <span
            className="poster__progress-fill"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </span>
      )}
    </button>
  );
}
