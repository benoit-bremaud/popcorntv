import { Fragment, useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@popcorntv/shared';
import { onUnauthenticated } from '../api.js';
import { AccountMenu } from './AccountMenu.js';
import { SetupForm } from './SetupForm.js';
import { SignInForm } from './SignInForm.js';
import type { AuthApi } from './auth-api.js';
import { defaultAuthApi, setupTokenFromHash } from './auth-api.js';

/** Who is at the door (spec auth UC11, UC13). */
type Gate =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'setup' }
  | { readonly kind: 'signIn' }
  | { readonly kind: 'signedIn'; readonly user: User };

type Props = {
  /** The signed-in app; `account` is the header menu to place in it. */
  readonly children: (user: User, account: ReactNode) => ReactNode;
  readonly api?: AuthApi;
  /** Injected in tests; `window.location` / `window.history` otherwise. */
  readonly location?: Pick<Location, 'hash' | 'pathname'>;
  readonly history?: Pick<History, 'replaceState'>;
};

/**
 * Shows setup, sign-in or the app depending on `GET /auth/status`; any later `401` (the
 * session expired or was revoked) brings the sign-in form back.
 */
export function AuthGate({
  children,
  api = defaultAuthApi,
  location = globalThis.location,
  history = globalThis.history,
}: Props): React.JSX.Element {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  const start = useCallback(async () => {
    setGate({ kind: 'loading' });
    try {
      const status = await api.status();
      if (status.user) setGate({ kind: 'signedIn', user: status.user });
      else setGate({ kind: status.setupRequired ? 'setup' : 'signIn' });
    } catch {
      setGate({ kind: 'failed' });
    }
  }, [api]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    onUnauthenticated(() => setGate({ kind: 'signIn' }));
    return () => onUnauthenticated(() => undefined);
  }, []);

  function signedIn(user: User): void {
    // The setup token must not stay in the address bar or the history.
    if (location.hash !== '') history.replaceState(null, '', location.pathname);
    setGate({ kind: 'signedIn', user });
  }

  if (gate.kind === 'signedIn') {
    const account = (
      <AccountMenu user={gate.user} api={api} onSignedOut={() => setGate({ kind: 'signIn' })} />
    );
    // Keyed by user: another account starts from a fresh profile list.
    return <Fragment key={gate.user.id}>{children(gate.user, account)}</Fragment>;
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
        {gate.kind === 'signIn' && <SignInForm signIn={api.signIn} onSignedIn={signedIn} />}
      </main>
    </>
  );
}
