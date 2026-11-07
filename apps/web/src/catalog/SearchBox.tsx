type Props = {
  readonly query: string;
  readonly onChange: (query: string) => void;
};

/** UC24: the catalog search field (spec search R1); Escape clears it. */
export function SearchBox({ query, onChange }: Props): React.JSX.Element {
  return (
    <search className="search">
      <input
        type="search"
        className="search__input"
        aria-label="Search titles and people"
        placeholder="Search titles and people"
        value={query}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing) onChange('');
        }}
      />
    </search>
  );
}
