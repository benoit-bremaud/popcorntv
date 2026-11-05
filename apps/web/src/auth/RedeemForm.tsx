import { useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@popcorntv/shared';
import type { RedeemBody, User } from '@popcorntv/shared';
import type { AuthResult } from '../api.js';
import { useAuthSubmit, useFocusedTitle } from './form-hooks.js';

type Props = {
  readonly kind: 'invite' | 'reset';
  /** From the `#/invite/<token>` or `#/reset/<token>` link. */
  readonly token: string;
  readonly redeem: (body: RedeemBody) => Promise<AuthResult>;
  readonly onSignedIn: (user: User) => void;
  /** Leaves the link for the sign-in form. */
  readonly onCancel: () => void;
};

/** UC12 (accept an invitation: username + password) and UC20 (set a new password). */
export function RedeemForm({
  kind,
  token,
  redeem,
  onSignedIn,
  onCancel,
}: Props): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useAuthSubmit(onSignedIn);
  const heading = useFocusedTitle();
  const invite = kind === 'invite';
  const body = (): RedeemBody =>
    invite ? { kind, token, username, password } : { kind, token, password };
  return (
    <section className="auth" aria-labelledby="auth-title">
      <h2 id="auth-title" className="profiles-title" ref={heading} tabIndex={-1}>
        {invite ? 'Join PopCornTV' : 'Set a new password'}
      </h2>
      <p className="muted">
        {invite
          ? 'You were invited. Pick a username and a password.'
          : 'Your other devices will be signed out.'}
      </p>
      <form className="auth-form" onSubmit={(event) => void submit(event, () => redeem(body()))}>
        {invite && (
          <label className="auth-field">
            <span>Username</span>
            <input
              className="input"
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._\-]+"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
        )}
        <label className="auth-field">
          <span>
            {invite ? 'Password' : 'New password'} ({PASSWORD_MIN} characters or more)
          </span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && (
          <p className="profile-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button" disabled={busy}>
          {invite ? 'Create my account' : 'Save and sign in'}
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Sign in instead
        </button>
      </form>
    </section>
  );
}
