import { useState } from 'react';
import type { FormEvent } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@popcorntv/shared';
import type { User } from '@popcorntv/shared';
import type { AuthApi } from './auth-api.js';
import { authMessage } from './auth-api.js';

type Props = {
  readonly user: User;
  readonly api: Pick<AuthApi, 'signOut' | 'changePassword'>;
  /** The session is over on this device: back to the sign-in form. */
  readonly onSignedOut: () => void;
};

/** UC14 and UC19 from the header: sign out here or everywhere, change my password. */
export function AccountMenu({ user, api, onSignedOut }: Props): React.JSX.Element {
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut(everywhere: boolean): Promise<void> {
    setBusy(true);
    const done = await api.signOut(everywhere);
    setBusy(false);
    if (done) onSignedOut();
    else setMessage(authMessage(null));
  }

  async function change(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    const result = await api.changePassword({ current, next });
    setBusy(false);
    if (result.ok) {
      setChanging(false);
      setCurrent('');
      setNext('');
      setMessage('Password changed. Your other devices were signed out.');
    } else {
      setMessage(authMessage(result.error));
    }
  }

  return (
    <details className="account">
      <summary className="account-summary">
        <span className="visually-hidden">Account: </span>
        {user.username}
      </summary>
      <div className="account-panel">
        {message && (
          <p className="account-message" role="status">
            {message}
          </p>
        )}
        {changing ? (
          <form className="auth-form" onSubmit={(event) => void change(event)}>
            <label className="auth-field">
              Current password
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
              New password
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
      </div>
    </details>
  );
}
