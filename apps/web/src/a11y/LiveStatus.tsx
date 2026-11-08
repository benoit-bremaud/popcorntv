import { useEffect, useState } from 'react';

/** How long typing must pause before a search status is announced (spec search R3). */
export const SETTLE_MS = 500;

type Props = {
  readonly message: string;
};

/**
 * A visually hidden polite live region. Always mounted: a region inserted together with its
 * text is not announced by most screen readers. `role="status"` with an explicit `aria-live`
 * because Orca on Firefox ignores the implicit live value of `<output>` (#165).
 */
export function LiveStatus({ message }: Props): React.JSX.Element {
  return (
    <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}

/**
 * `message` once it has stayed the same for `delayMs`, so rapid typing yields one announcement;
 * an empty message clears at once, so a stale count is never read after the query is cleared.
 */
export function useSettledMessage(message: string, delayMs = SETTLE_MS): string {
  const [settled, setSettled] = useState(message);
  useEffect(() => {
    if (message === '') {
      setSettled('');
      return;
    }
    const timer = setTimeout(() => setSettled(message), delayMs);
    return () => clearTimeout(timer);
  }, [message, delayMs]);
  return settled;
}
