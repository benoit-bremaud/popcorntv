import { useState } from 'react';
import type { SignInBody, User } from '@popcorntv/shared';
import type { AuthResult } from '../api.js';
import { useAuthSubmit, useFocusedTitle } from './form-hooks.js';

type Props = {
  readonly onSignedIn: (user: User) => void;
  readonly signIn: (body: SignInBody) => Promise<AuthResult>;
};

/** UC13: username + password. */
export function SignInForm({ onSignedIn, signIn }: Props): React.JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, submit } = useAuthSubmit(onSignedIn);
  const heading = useFocusedTitle();
  return (
    <section className="auth" aria-labelledby="auth-title">
      <h2 id="auth-title" className="profiles-title" ref={heading} tabIndex={-1}>
        Sign in
      </h2>
      <form
        className="auth-form"
        onSubmit={(event) => void submit(event, () => signIn({ username, password }))}
      >
        <label className="auth-field">
          <span>Username</span>
          <input
            className="input"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            className="input"
            name="password"
            type="password"
            autoComplete="current-password"
            required
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
          Sign in
        </button>
      </form>
    </section>
  );
}
