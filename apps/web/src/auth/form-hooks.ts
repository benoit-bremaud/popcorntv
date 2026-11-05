import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '@popcorntv/shared';
import type { AuthResult } from '../api.js';
import { authMessage } from './auth-api.js';

/** Shared submit flow of the auth forms: one request at a time, the error shown in an alert. */
export function useAuthSubmit(onSignedIn: (user: User) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent, send: () => Promise<AuthResult>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await send();
    setBusy(false);
    if (result.ok) onSignedIn(result.user);
    else setError(authMessage(result.error));
  }
  return { busy, error, submit };
}

/** The view replaced the one holding focus: start on the title. */
export function useFocusedTitle() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return heading;
}
