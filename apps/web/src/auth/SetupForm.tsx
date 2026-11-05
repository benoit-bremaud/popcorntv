import { useState } from 'react';
import { PASSWORD_MAX, PASSWORD_MIN } from '@popcorntv/shared';
import type { SetupBody, User } from '@popcorntv/shared';
import type { AuthResult } from '../api.js';
import { useAuthSubmit, useFocusedTitle } from './form-hooks.js';

type Props = {
  readonly onSignedIn: (user: User) => void;
  readonly setUp: (body: SetupBody) => Promise<AuthResult>;
  /** From the `#/setup/<token>` link, else empty. */
  readonly initialToken: string;
};

/** UC11: the setup token (prefilled from the link), the owner's username and password. */
export function SetupForm({ onSignedIn, setUp, initialToken }: Props): React.JSX.Element {
  const [token, setToken] = useState(initialToken);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useAuthSubmit(onSignedIn);
  const heading = useFocusedTitle();
  return (
    <section className="auth" aria-labelledby="auth-title">
      <h2 id="auth-title" className="profiles-title" ref={heading} tabIndex={-1}>
        Set up PopCornTV
      </h2>
      <p className="muted">
        Create the owner account. The setup link is printed in the server log.
      </p>
      <form
        className="auth-form"
        onSubmit={(event) => void submit(event, () => setUp({ token, username, password }))}
      >
        <label className="auth-field">
          <span>Setup token</span>
          <input
            className="input"
            name="token"
            autoComplete="off"
            required
            value={token}
            onChange={(event) => setToken(event.target.value.trim())}
          />
        </label>
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
        <label className="auth-field">
          <span>Password ({PASSWORD_MIN} characters or more)</span>
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
          Create the owner account
        </button>
      </form>
    </section>
  );
}
