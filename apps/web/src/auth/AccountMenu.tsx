import { useEffect, useRef, useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@popcorntv/shared';
import type { User } from '@popcorntv/shared';
import type { AuthApi } from './auth-api.js';
import { authMessage } from './auth-api.js';

type Props = {
  readonly user: User;
  readonly api: Pick<AuthApi, 'signOut' | 'changePassword' | 'version'>;
  /** The session is over on this device: back to the sign-in form. */
  readonly onSignedOut: () => void;
  /** Owners only: opens the household administration (UC15–UC18). */
  readonly onAdmin?: () => void;
};

/** UC14 and UC19 from the header: sign out here or everywhere, change my password. */
export function AccountMenu({ user, api, onSignedOut, onAdmin }: Props): React.JSX.Element {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  // #164: an open menu closes on Escape (focus back on the summary) and on a pointer-down
  // outside it. Escape is left to a modal dialog open above, which closes first (ADR-0024).
  useEffect(() => {
    if (!open) return;
    const current = ref.current;
    if (!current) return;
    const panel: HTMLDetailsElement = current;
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      panel.open = false;
      panel.querySelector('summary')?.focus();
    }
    function onPointer(event: PointerEvent): void {
      if (event.target instanceof Node && panel.contains(event.target)) return;
      panel.open = false;
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  function close(): void {
    if (ref.current) ref.current.open = false;
  }

  // Which build runs (#162): read once, the menu simply omits it when the server cannot say.
  useEffect(() => {
    let live = true;
    void api.version().then((value) => {
      if (live) setVersion(value);
    });
    return () => {
      live = false;
    };
  }, [api]);

  async function signOut(everywhere: boolean): Promise<void> {
    setBusy(true);
    const done = await api.signOut(everywhere);
    setBusy(false);
    if (done) onSignedOut();
    else setMessage(authMessage(null));
  }

  async function change(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const result = await api.changePassword({ current, next });
    setBusy(false);
    if (result.ok) {
      setChanging(false);
      setCurrent('');
      setNext('');
      setMessage('Password changed. Your other devices were signed out.');
    } else if (result.error === 'unauthenticated') {
      // The session ended meanwhile (expired, revoked): sign in again.
      onSignedOut();
    } else if (result.error === 'invalid_credentials') {
      setMessage('Wrong current password.');
    } else {
      setMessage(authMessage(result.error));
    }
  }

  return (
    <details ref={ref} className="account" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="account-summary">
        <span className="visually-hidden">Account: </span>
        {user.username}
      </summary>
      <div className="account-panel">
        {message && <output className="account-message">{message}</output>}
        {changing ? (
          <form className="auth-form" onSubmit={(event) => void change(event)}>
            <label className="auth-field">
              <span>Current password</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </label>
            <label className="auth-field">
              <span>New password</span>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </label>
            <button type="submit" className="button" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => setChanging(false)}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            {onAdmin && user.role === 'owner' && (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => {
                  close();
                  onAdmin();
                }}
              >
                Administration
              </button>
            )}
            <button type="button" className="button button-quiet" onClick={() => setChanging(true)}>
              Change password
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => void signOut(false)}
            >
              Sign out
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={busy}
              onClick={() => void signOut(true)}
            >
              Sign out everywhere
            </button>
          </>
        )}
        {version && <p className="account-version">PopCornTV {version}</p>}
      </div>
    </details>
  );
}
