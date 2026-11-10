import { useEffect, useId, useState } from 'react';
import { normaliseTitleLink } from '@popcorntv/shared';
import type { DiscoverKind, TitleLink as Link } from '@popcorntv/shared';
import { loadTitleLink, saveTitleLink } from '../api.js';

/** The title-link calls (UC30); injected by tests. */
export interface TitleLinkApi {
  readonly load: typeof loadTitleLink;
  readonly save: typeof saveTitleLink;
}

const titleLinkApi: TitleLinkApi = { load: loadTitleLink, save: saveTitleLink };

type Props = {
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
  readonly api?: TitleLinkApi;
};

/**
 * UC30 block: the owner's own link of a title, opened in a new tab; an owner may set, edit or
 * remove it (spec title-link R6). PopCornTV never fetches the link (R5).
 */
export function TitleLink({ kind, tmdbId, api = titleLinkApi }: Props): React.JSX.Element | null {
  const [link, setLink] = useState<Link | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  useEffect(() => {
    let live = true;
    setLink(null);
    setDraft(null);
    // A failure shows nothing: the rest of the sheet is unaffected (R6).
    api.load(kind, tmdbId).then(
      (answer) => live && setLink(answer),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [kind, tmdbId, api]);

  async function save(url: string | null): Promise<void> {
    setBusy(true);
    const ok = await api.save(kind, tmdbId, url);
    setBusy(false);
    setError(!ok);
    if (!ok || link === null) return;
    setLink({ ...link, url });
    setDraft(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (draft === null) return;
    const url = normaliseTitleLink(draft);
    if (url === null) {
      setError(true);
      return;
    }
    void save(url);
  }

  if (link === null || (link.url === null && !link.editable)) return null;

  return (
    <div className="title-link">
      {link.url !== null && (
        <a className="button" href={link.url} target="_blank" rel="noopener noreferrer">
          Open my link
        </a>
      )}
      {link.editable && draft === null && (
        <button
          type="button"
          className="chip"
          onClick={() => {
            setError(false);
            setDraft(link.url ?? '');
          }}
        >
          {link.url === null ? '+ Add my link' : 'Edit link'}
        </button>
      )}
      {link.editable && draft !== null && (
        <form className="title-link__form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor={fieldId}>
            My link
          </label>
          <input
            id={fieldId}
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft}
            aria-invalid={error}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="button" disabled={busy}>
            Save
          </button>
          {link.url !== null && (
            <button type="button" className="chip" disabled={busy} onClick={() => void save(null)}>
              Remove
            </button>
          )}
          <button type="button" className="chip" onClick={() => setDraft(null)}>
            Cancel
          </button>
          {error && (
            <p className="muted" role="alert">
              Enter an http(s) link.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
