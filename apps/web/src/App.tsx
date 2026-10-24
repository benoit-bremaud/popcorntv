import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile } from '@popcorntv/shared';
import { loadProfiles } from './api.js';
import { CatalogPage } from './catalog/CatalogPage.js';
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
};

/** The web player shell: brand header, "Who's watching?" (UC8 / UC9), then the catalog. */
export function App({ load = loadProfiles, profileApi, storage }: Props): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
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

  function pick(profile: Profile): void {
    rememberProfileId(profile.id, storage);
    setView({ kind: 'active', profile });
  }

  return (
    <>
      <header className="header">
        <h1 className="brand">PopCornTV</h1>
        {view.kind === 'active' && (
          <button
            type="button"
            className="switch-profile"
            onClick={() => setView({ kind: 'picking' })}
          >
            <Avatar profile={view.profile} size="sm" />
            <span className="switch-name">{view.profile.name}</span>
            <span className="visually-hidden">, switch profile</span>
          </button>
        )}
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
            onDone={() => setView({ kind: 'picking' })}
            api={profileApi}
          />
        )}
        {view.kind === 'active' && <CatalogPage profileId={view.profile.id} />}
      </main>
    </>
  );
}
