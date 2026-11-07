import { useCallback, useEffect, useState } from 'react';
import { LIBRARY_KINDS } from '@popcorntv/shared';
import type {
  ApiErrorCode,
  EnrichReport,
  Library,
  LibraryKind,
  MediaFolderList,
  ScanReport,
} from '@popcorntv/shared';
import type { AdminApi, AdminResult } from '../api.js';
import { authMessage } from './auth-api.js';

type Props = {
  readonly api: AdminApi;
};

/** The "Other folder" choice of the folder list: the owner types the path. */
const OTHER = '';

/** The name a folder suggests: `series` → `Series`. */
const suggestedName = (folderName: string) =>
  folderName.charAt(0).toUpperCase() + folderName.slice(1);

/** What to tell the owner for a refused library call (spec library-management §2). */
export function libraryMessage(error: ApiErrorCode | null): string {
  switch (error) {
    case 'root_in_use':
      return 'This folder is, contains or sits inside another library.';
    case 'scan_running':
    case 'enrich_running':
      return 'A scan or a refresh of this library is already running.';
    case 'root_unreadable':
      return 'The server cannot read this folder.';
    case 'tmdb_not_configured':
      return 'Metadata is off: TMDB_API_KEY is not set on the server.';
    case 'library_not_found':
      return 'This library no longer exists: the list was refreshed.';
    case 'forbidden':
      return 'Only an owner can do this.';
    case 'invalid_request':
      return 'Check the name and the folder: an absolute path under the media root.';
    default:
      return authMessage(error);
  }
}

function metadataSummary(report: EnrichReport): string {
  return `${report.matched} matched, ${report.unmatched.length} unknown, ${report.failed.length} failed`;
}

function scanSummary(name: string, report: ScanReport): string {
  const files = `${report.added} added, ${report.updated} updated, ${report.removed} removed, ${report.skipped.length} skipped`;
  const metadata =
    report.metadata === null ? '' : ` · metadata: ${metadataSummary(report.metadata)}`;
  return `${name} scanned: ${files}${metadata}.`;
}

/** UC21 with UC1 and UC2: add, scan, refresh, rename and delete libraries (owner only). */
export function LibrarySection({ api }: Props): React.JSX.Element {
  const [libraries, setLibraries] = useState<readonly Library[]>([]);
  const [folders, setFolders] = useState<MediaFolderList | null>(null);
  /** Null until the owner picks: the first free folder is then preselected. */
  const [folder, setFolder] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LibraryKind>('films');
  /** The library a scan or a refresh is running on (ADR-0014 §2: synchronous request). */
  const [busy, setBusy] = useState<{
    readonly id: string;
    readonly action: 'scan' | 'enrich';
  } | null>(null);
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly name: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<{ readonly id: string; readonly typed: string } | null>(
    null,
  );
  const [report, setReport] = useState<string | null>(null);
  /** Add is disabled while a create is in flight: a double click must not send two. */
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [l, f] = await Promise.all([api.libraries(), api.folders()]);
    if (l.ok) setLibraries(l.value);
    if (f.ok) setFolders(f.value);
    const failed = [l, f].find((r) => !r.ok);
    setMessage(failed && !failed.ok ? libraryMessage(failed.error) : null);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs one call, then reloads; a refusal is shown under the title. */
  async function act<T>(run: () => Promise<AdminResult<T>>, done?: (value: T) => void) {
    const result = await run();
    await refresh();
    if (result.ok) done?.(result.value);
    else setMessage(libraryMessage(result.error));
  }

  const free = folders?.folders.filter((candidate) => candidate.libraryId === null) ?? [];
  const selected = folder ?? free[0]?.path ?? OTHER;
  const selectedName = free.find((candidate) => candidate.path === selected)?.name;
  const suggestion = selectedName === undefined ? '' : suggestedName(selectedName);

  async function add(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const rootPath = selected === OTHER ? path.trim() : selected;
    setAdding(true);
    await act(
      () => api.createLibrary({ name: name.trim() || suggestion, rootPath, kind }),
      (library) => {
        setFolder(null);
        setPath('');
        setName('');
        setReport(`${library.name} added: scan it to fill the catalog.`);
      },
    );
    setAdding(false);
  }

  async function scan(library: Library): Promise<void> {
    setBusy({ id: library.id, action: 'scan' });
    setReport(null);
    await act(
      () => api.scan(library.id),
      (scanned) => setReport(scanSummary(library.name, scanned)),
    );
    setBusy(null);
  }

  async function enrich(library: Library): Promise<void> {
    setBusy({ id: library.id, action: 'enrich' });
    setReport(null);
    await act(
      () => api.enrich(library.id, true),
      (enriched) => setReport(`${library.name} refreshed: ${metadataSummary(enriched)}.`),
    );
    setBusy(null);
  }

  return (
    <>
      <h3 className="admin-title">Libraries</h3>
      {message && (
        <p className="profile-error" role="alert">
          {message}
        </p>
      )}
      {report && <output className="admin-report">{report}</output>}
      <ul className="admin-list" aria-label="Libraries">
        {libraries.length === 0 && <li className="muted">No library yet.</li>}
        {libraries.map((library) => {
          const running = busy?.id === library.id ? busy.action : null;
          return (
            <li key={library.id} className="admin-item">
              {renaming?.id === library.id ? (
                <form
                  className="admin-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act(
                      () => api.renameLibrary(library.id, renaming.name.trim()),
                      () => setRenaming(null),
                    );
                  }}
                >
                  <input
                    className="input"
                    aria-label={`New name of ${library.name}`}
                    value={renaming.name}
                    maxLength={200}
                    onChange={(event) => setRenaming({ id: library.id, name: event.target.value })}
                  />
                  <button type="submit" className="button">
                    Save
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <span className="admin-name">
                  {library.name}
                  <span className="muted">
                    {' '}
                    · {library.kind} · {library.rootPath}
                  </span>
                </span>
              )}
              <button
                type="button"
                className="button"
                disabled={busy !== null}
                onClick={() => void scan(library)}
              >
                {running === 'scan' ? 'Scanning…' : 'Scan'}
              </button>
              <button
                type="button"
                className="button button-quiet"
                disabled={busy !== null}
                onClick={() => void enrich(library)}
              >
                {running === 'enrich' ? 'Refreshing…' : 'Refresh metadata'}
              </button>
              <button
                type="button"
                className="button button-quiet"
                aria-label={`Rename ${library.name}`}
                onClick={() => setRenaming({ id: library.id, name: library.name })}
              >
                Rename
              </button>
              {deleting?.id === library.id ? (
                <span className="admin-row">
                  <input
                    className="input"
                    aria-label={`Type ${library.name} to confirm`}
                    value={deleting.typed}
                    onChange={(event) => setDeleting({ id: library.id, typed: event.target.value })}
                  />
                  <button
                    type="button"
                    className="button"
                    disabled={deleting.typed !== library.name || busy !== null}
                    onClick={() =>
                      void act(
                        () => api.deleteLibrary(library.id),
                        () => setDeleting(null),
                      )
                    }
                  >
                    Delete {library.name} and its catalog
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="button button-quiet"
                  aria-label={`Delete ${library.name}`}
                  onClick={() => setDeleting({ id: library.id, typed: '' })}
                >
                  Delete
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted">Deleting a library never deletes the files on disk.</p>

      <h4 className="admin-title">Add a library</h4>
      <form className="admin-row" onSubmit={(event) => void add(event)}>
        <label className="auth-field">
          <span>Folder</span>
          <select
            className="input"
            value={selected}
            onChange={(event) => setFolder(event.target.value)}
          >
            {free.map((candidate) => (
              <option key={candidate.path} value={candidate.path}>
                {candidate.name}
              </option>
            ))}
            <option value={OTHER}>Other folder…</option>
          </select>
        </label>
        {selected === OTHER && (
          <label className="auth-field">
            <span>Path</span>
            <input
              className="input"
              value={path}
              placeholder={folders ? `${folders.root}/…` : '/…'}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
        )}
        <label className="auth-field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            placeholder={suggestion}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="auth-field">
          <span>Kind</span>
          <select
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value as LibraryKind)}
          >
            {LIBRARY_KINDS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button" disabled={adding}>
          Add
        </button>
      </form>
    </>
  );
}
