import type { Media } from '@popcorntv/shared';
import type { Row } from './catalog.js';
import { PosterCard } from './PosterCard.js';

type Props = {
  readonly row: Row;
  readonly onOpen: (item: Media, trigger: HTMLElement) => void;
};

/** A titled horizontal shelf of posters; its entrance stagger lives in `catalog.css`. */
export function PosterRow({ row, onOpen }: Props): React.JSX.Element {
  const headingId = `row-${row.key}`;
  return (
    <section className="row" aria-labelledby={headingId}>
      <h2 className="row__title" id={headingId}>
        {row.title}
      </h2>
      <ul className="row__track">
        {row.items.map((item) => (
          <li key={item.id}>
            <PosterCard item={item} onOpen={onOpen} progress={row.progress?.get(item.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
