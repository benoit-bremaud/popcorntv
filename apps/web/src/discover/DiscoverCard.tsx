import type { DiscoverTitle } from '@popcorntv/shared';
import { posterUrl } from '../api.js';

type Props = {
  readonly title: DiscoverTitle;
  readonly onOpen: (title: DiscoverTitle, trigger: HTMLElement) => void;
  /** Shown on My list once the title is on disk (spec discover-wishlist R6). */
  readonly availableLabel?: string;
};

/** One Discover poster; "In my library" when a local media carries its TMDB id (R4). */
export function DiscoverCard({
  title,
  onOpen,
  availableLabel = 'In my library',
}: Props): React.JSX.Element {
  const name = title.year === null ? title.title : `${title.title} (${title.year})`;
  const owned = title.mediaId !== null;
  return (
    <button
      type="button"
      className="poster"
      aria-label={owned ? `${name}, ${availableLabel.toLowerCase()}` : name}
      onClick={(event) => onOpen(title, event.currentTarget)}
    >
      {title.posterPath === null ? (
        <span className="poster__placeholder" aria-hidden="true">
          {title.title}
        </span>
      ) : (
        <img className="poster__image" src={posterUrl(title.posterPath)} alt="" loading="lazy" />
      )}
      {owned && (
        <span className="poster__badge" aria-hidden="true">
          {availableLabel}
        </span>
      )}
      {title.voteAverage > 0 && (
        <span className="poster__rating" aria-hidden="true">
          ★ {title.voteAverage.toFixed(1)}
        </span>
      )}
    </button>
  );
}
