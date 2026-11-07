import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Profile } from '@popcorntv/shared';
import { loadProfiles } from './api.js';
import { CatalogPage } from './catalog/CatalogPage.js';
import { DiscoverPage } from './discover/DiscoverPage.js';
import type { DiscoverApi } from './discover/discover-api.js';
import { rememberProfileId, rememberedProfileId } from './profiles/active-profile.js';
import { Avatar } from './profiles/Avatar.js';
import { ManageProfiles } from './profiles/ManageProfiles.js';
import type { ProfileApi } from './profiles/ManageProfiles.js';
import { ProfilePicker } from './profiles/ProfilePicker.js';

/** The app around the active profile (state diagram profiles/05). */
type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'picking' }
  | { readonly kind: 'managing' }
  | { readonly kind: 'active'; readonly profile: Profile };

type Props = {
  /** Injected in tests; default to the real API and `localStorage`. */
  readonly load?: typeof loadProfiles;
  readonly profileApi?: ProfileApi;
  readonly storage?: Storage;
  /** The signed-in account's menu (sign out, change password), shown in the header. */
  readonly account?: ReactNode;
  /** Owners only: opens the library section from the empty catalog (spec library-management R7). */
  readonly onAddLibrary?: () => void;
  /** Injected in tests; defaults to the real Discover API (UC26). */
  readonly discover?: DiscoverApi;
};

/** The two catalog tabs: the files on disk, or TMDB titles beyond them (UC26). */
type Tab =
  { readonly kind: 'library'; readonly openMediaId: string | null } | { readonly kind: 'discover' };

/** The web player shell: brand header, "Who's watching?" (UC8 / UC9), then the catalog. */
export function App({
  load = loadProfiles,
  profileApi,
  storage,
  account,
  onAddLibrary,
  discover,
}: Props): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [tab, setTab] = useState<Tab>({ kind: 'library', openMediaId: null });
  const [profiles, setProfiles] = useState<readonly Profile[]>([]);
  /** Only the latest load may set `profiles` (two quick writes, two refreshes). */
  const latest = useRef(0);

  const refresh = useCallback(async (): Promise<readonly Profile[] | null> => {
    const request = ++latest.current;
    try {
      const list = await load();
      if (request === latest.current) setProfiles(list);
      return list;
    } catch {
      return null;
    }
  }, [load]);

  const start = useCallback(async () => {
    setView({ kind: 'loading' });
    const list = await refresh();
    if (list === null) return setView({ kind: 'failed' });
    const remembered = rememberedProfileId(storage);
    const profile = list.find((candidate) => candidate.id === remembered);
    setView(profile === undefined ? { kind: 'picking' } : { kind: 'active', profile });
  }, [refresh, storage]);

  useEffect(() => {
    void start();
  }, [start]);

  /** A pick unmounts the focused tile: focus moves to the header switch instead. */
  const switchButton = useRef<HTMLButtonElement>(null);
  const picked = useRef(false);

  useEffect(() => {
    if (view.kind !== 'active' || !picked.current) return;
    picked.current = false;
    switchButton.current?.focus();
  }, [view]);

  function pick(profile: Profile): void {
    rememberProfileId(profile.id, storage);
    // A title Discover asked to open belongs to the previous visit, not to this profile.
    setTab({ kind: 'library', openMediaId: null });
    picked.current = true;
    setView({ kind: 'active', profile });
  }

  /** The picker must never offer a deleted profile: Done waits for a fresh list. */
  async function finishManaging(): Promise<void> {
    setView({ kind: 'loading' });
    const list = await refresh();
    setView(list === null ? { kind: 'failed' } : { kind: 'picking' });
  }

  return (
    <>
      <header className="header">
        <h1 className="brand">PopCornTV</h1>
        {view.kind === 'active' && (
          <button
            ref={switchButton}
            type="button"
            className="switch-profile"
            onClick={() => setView({ kind: 'picking' })}
          >
            <Avatar profile={view.profile} size="sm" />
            <span className="switch-name">{view.profile.name}</span>
            <span className="visually-hidden">, switch profile</span>
          </button>
        )}
        {account}
      </header>
      <main className="shell">
        {view.kind === 'loading' && <p className="status muted">Loading…</p>}
        {view.kind === 'failed' && (
          <div className="status" role="alert">
            <p>The server could not be reached.</p>
            <button type="button" className="button" onClick={() => void start()}>
              Retry
            </button>
          </div>
        )}
        {view.kind === 'picking' && (
          <ProfilePicker
            profiles={profiles}
            onPick={pick}
            onManage={() => setView({ kind: 'managing' })}
          />
        )}
        {view.kind === 'managing' && (
          <ManageProfiles
            profiles={profiles}
            onChanged={() => void refresh()}
            onDone={() => void finishManaging()}
            api={profileApi}
          />
        )}
        {view.kind === 'active' && (
          <>
            <nav className="tabs" aria-label="Catalog">
              <button
                type="button"
                className="chip"
                aria-pressed={tab.kind === 'library'}
                onClick={() => setTab({ kind: 'library', openMediaId: null })}
              >
                Library
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={tab.kind === 'discover'}
                onClick={() => setTab({ kind: 'discover' })}
              >
                Discover
              </button>
            </nav>
            {tab.kind === 'library' ? (
              <CatalogPage
                profileId={view.profile.id}
                onAddLibrary={onAddLibrary}
                openMediaId={tab.openMediaId}
              />
            ) : (
              <DiscoverPage
                profileId={view.profile.id}
                api={discover}
                onPlayInLibrary={(mediaId) => setTab({ kind: 'library', openMediaId: mediaId })}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
