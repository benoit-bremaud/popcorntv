import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@popcorntv/shared';
import { adminApi, onUnauthenticated } from '../api.js';
import type { AdminApi } from '../api.js';
import { AccountMenu } from './AccountMenu.js';
import { AdminPanel } from './AdminPanel.js';
import { RedeemForm } from './RedeemForm.js';
import { SetupForm } from './SetupForm.js';
import { SignInForm } from './SignInForm.js';
import type { AuthApi } from './auth-api.js';
import { defaultAuthApi, linkFromHash, setupTokenFromHash } from './auth-api.js';

/** Who is at the door (spec auth UC11, UC12, UC13, UC20); `admin` is the owner's panel. */
type Gate =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'setup' }
  | { readonly kind: 'signIn' }
  | { readonly kind: 'redeem'; readonly link: 'invite' | 'reset'; readonly token: string }
  | { readonly kind: 'signedIn'; readonly user: User }
  | { readonly kind: 'admin'; readonly user: User };

type Props = {
  /**
   * The signed-in app; `account` is the header menu to place in it. `openAdmin` is set for
   * an owner only: the empty catalog offers "Add a library".
   */
  readonly children: (user: User, account: ReactNode, openAdmin?: () => void) => ReactNode;
  readonly api?: AuthApi;
  readonly admin?: AdminApi;
  /** Injected in tests; `window.location` / `window.history` otherwise. */
  readonly location?: Pick<Location, 'hash' | 'pathname'>;
  readonly history?: Pick<History, 'replaceState'>;
};

const defaultAdminApi = adminApi();

/**
 * Shows setup, an invitation or reset link, sign-in or the app depending on `GET /auth/status`; any later `401` (the
 * session expired or was revoked) brings the sign-in form back.
 */
export function AuthGate({
  children,
  api = defaultAuthApi,
  admin = defaultAdminApi,
  location = globalThis.location,
  history = globalThis.history,
}: Props): React.JSX.Element {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  const start = useCallback(async () => {
    setGate({ kind: 'loading' });
    try {
      const status = await api.status();
      // An invitation or reset link wins over a session: the person opened it on purpose.
      const link = status.setupRequired ? null : linkFromHash(location.hash);
      if (link) setGate({ kind: 'redeem', link: link.kind, token: link.token });
      else if (status.user) setGate({ kind: 'signedIn', user: status.user });
      else setGate({ kind: status.setupRequired ? 'setup' : 'signIn' });
    } catch {
      setGate({ kind: 'failed' });
    }
  }, [api, location]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    onUnauthenticated(() => setGate({ kind: 'signIn' }));
    return () => onUnauthenticated(() => undefined);
  }, []);

  /** A link token must not stay in the address bar or the history. */
  function forgetLink(): void {
    if (location.hash !== '') history.replaceState(null, '', location.pathname);
  }

  function signedIn(user: User): void {
    forgetLink();
    setGate({ kind: 'signedIn', user });
  }

  if (gate.kind === 'signedIn' || gate.kind === 'admin') {
    const { user } = gate;
    const openAdmin = () => setGate({ kind: 'admin', user });
    const account = (
      <AccountMenu
        user={user}
        api={api}
        onSignedOut={() => setGate({ kind: 'signIn' })}
        onAdmin={openAdmin}
      />
    );
    if (gate.kind === 'admin') {
      return (
        <>
          <header className="header">
            <h1 className="brand">PopCornTV</h1>
            {account}
          </header>
          <main className="shell">
            <AdminPanel
              api={admin}
              user={user}
              // Re-read the status: the owner may have changed their own role.
              onClose={() => void start()}
            />
          </main>
        </>
      );
    }
    // Keyed by user: another account starts from a fresh profile list.
    return (
      <Fragment key={gate.user.id}>
        {children(gate.user, account, user.role === 'owner' ? openAdmin : undefined)}
      </Fragment>
    );
  }

  return (
    <>
      <header className="header">
        <h1 className="brand">PopCornTV</h1>
      </header>
      <main className="shell">
        {gate.kind === 'loading' && <p className="status muted">Loading…</p>}
        {gate.kind === 'failed' && (
          <div className="status" role="alert">
            <p>The server could not be reached.</p>
            <button type="button" className="button" onClick={() => void start()}>
              Retry
            </button>
          </div>
        )}
        {gate.kind === 'setup' && (
          <SetupForm
            setUp={api.setUp}
            initialToken={setupTokenFromHash(location.hash)}
            onSignedIn={signedIn}
          />
        )}
        {gate.kind === 'redeem' && (
          <RedeemForm
            kind={gate.link}
            token={gate.token}
            redeem={api.redeem}
            onSignedIn={signedIn}
            onCancel={() => {
              forgetLink();
              void start();
            }}
          />
        )}
        {gate.kind === 'signIn' && <SignInForm signIn={api.signIn} onSignedIn={signedIn} />}
      </main>
    </>
  );
}
