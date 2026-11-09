import { useCallback, useEffect, useState } from 'react';
import { ROLES } from '@popcorntv/shared';
import type {
  Account,
  ApiErrorCode,
  AuthEvent,
  DeviceSession,
  Invitation,
  IssuedLink,
  Role,
  User,
} from '@popcorntv/shared';
import type { AdminApi, AdminResult } from '../api.js';
import { authMessage } from './auth-api.js';
import { deviceCount, formatDateTime } from './admin-format.js';
import { deviceLabel } from './device-label.js';
import { useFocusedTitle } from './form-hooks.js';
import { LibrarySection } from './LibrarySection.js';

type Props = {
  readonly api: AdminApi;
  /** The signed-in owner: their own row cannot be deleted from here by mistake. */
  readonly user: User;
  readonly onClose: () => void;
};

/** A link shown once, with what it is for. */
type Shown = {
  readonly label: string;
  readonly issued: IssuedLink;
  /** Set for a reset link: revoking that account's reset hides it. */
  readonly resetOf?: string;
};

/** What to tell the owner for a refused administration call. */
export function adminMessage(error: ApiErrorCode | null): string {
  switch (error) {
    case 'not_found':
    case 'session_not_found':
      return 'It no longer exists: the list was refreshed.';
    case 'forbidden':
      return 'Only an owner can do this.';
    default:
      return authMessage(error);
  }
}

const when = (iso: string | null) => formatDateTime(iso);

/**
 * UC21: manage libraries (scan and refresh included). UC15–UC18: invite a person,
 * manage accounts (role, reset link, devices, deletion) and
 * review sign-in activity. Owner only; the server enforces it again on every route.
 */
export function AdminPanel({ api, user, onClose }: Props): React.JSX.Element {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [invitations, setInvitations] = useState<readonly Invitation[]>([]);
  const [events, setEvents] = useState<readonly AuthEvent[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>('viewer');
  const [shown, setShown] = useState<Shown | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The account whose devices are open, with its live sessions. */
  const [devices, setDevices] = useState<{
    readonly userId: string;
    readonly list: readonly DeviceSession[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** What the last action did, when the list alone does not show it. */
  const [notice, setNotice] = useState<string | null>(null);
  const heading = useFocusedTitle();

  const refresh = useCallback(async () => {
    const [a, i, e] = await Promise.all([api.accounts(), api.invitations(), api.events()]);
    if (a.ok) setAccounts(a.value);
    if (i.ok) setInvitations(i.value);
    if (e.ok) setEvents(e.value);
    const failed = [a, i, e].find((r) => !r.ok);
    setMessage(failed && !failed.ok ? adminMessage(failed.error) : null);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Runs one action, then reloads; a refusal is shown, a success may show a link. */
  async function act<T>(
    run: () => Promise<AdminResult<T>>,
    done?: (value: T) => 'closed' | void,
  ): Promise<void> {
    setConfirming(null);
    setNotice(null);
    const result = await run();
    // Refresh either way: a refusal often means the list is stale (another owner acted).
    if (result.ok && done?.(result.value) === 'closed') return;
    await refresh();
    if (!result.ok) setMessage(adminMessage(result.error));
  }

  /** Hides a shown reset link of `userId` once the server has revoked it. */
  function forgetResetOf(userId: string): void {
    setShown((current) => (current?.resetOf === userId ? null : current));
  }

  /** UC17: a missing link (revoked meanwhile) is explained, a revoked one confirmed. */
  async function revokeReset(account: Account): Promise<void> {
    setConfirming(null);
    setNotice(null);
    const result = await api.revokeReset(account.id);
    forgetResetOf(account.id);
    await refresh();
    if (result.ok) setNotice(`Reset link of ${account.username} revoked.`);
    else if (result.error === 'not_found')
      setMessage(`${account.username} has no pending reset link: the list was refreshed.`);
    else setMessage(adminMessage(result.error));
  }

  async function showDevices(userId: string): Promise<void> {
    const result = await api.devices(userId);
    if (result.ok) {
      setDevices({ userId, list: result.value });
      return;
    }
    await refresh();
    setMessage(adminMessage(result.error));
  }

  return (
    <section className="admin" aria-labelledby="admin-title">
      <div className="admin-head">
        <h2 id="admin-title" className="profiles-title" ref={heading} tabIndex={-1}>
          Administration
        </h2>
        <button type="button" className="button button-quiet" onClick={onClose}>
          Done
        </button>
      </div>
      {message && (
        <p className="profile-error" role="alert">
          {message}
        </p>
      )}
      {notice && <output className="admin-report">{notice}</output>}
      {shown && (
        <output className="admin-link">
          <span>
            {shown.label} — shown once, valid until {when(shown.issued.expiresAt)}:
          </span>
          <input
            className="input"
            readOnly
            aria-label="Link to send"
            value={shown.issued.link}
            onFocus={(event) => event.target.select()}
          />
        </output>
      )}

      <LibrarySection api={api} />

      <h3 className="admin-title">Invite a person</h3>
      <div className="admin-row">
        <label className="auth-field">
          <span>Role</span>
          <select
            className="input"
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as Role)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button"
          onClick={() =>
            void act(
              () => api.invite(inviteRole),
              (issued) => setShown({ label: `Invitation (${inviteRole})`, issued }),
            )
          }
        >
          Create an invitation link
        </button>
      </div>
      {invitations.length > 0 && (
        <ul className="admin-list" aria-label="Pending invitations">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="admin-item">
              <span>
                {invitation.role}, expires {when(invitation.expiresAt)}
              </span>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => void act(() => api.revokeInvitation(invitation.id))}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="admin-title">Accounts</h3>
      <ul className="admin-list" aria-label="Accounts">
        {accounts.map((account) => (
          <li key={account.id} className="admin-item">
            <span className="admin-name">
              {account.username}
              <span className="muted">
                {' '}
                · last sign-in {when(account.lastLoginAt)} · {deviceCount(account.activeSessions)}
              </span>
            </span>
            <select
              className="input"
              aria-label={`Role of ${account.username}`}
              value={account.role}
              onChange={(event) => {
                const role = event.target.value as Role;
                void act(
                  () => api.setRole(account.id, role),
                  () => {
                    // The server revoked this account's pending reset link (UC17).
                    forgetResetOf(account.id);
                    // A self-demoted owner may no longer administer.
                    if (account.id === user.id && role !== 'owner') {
                      onClose();
                      return 'closed';
                    }
                  },
                );
              }}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button button-quiet"
              onClick={() =>
                void act(
                  () => api.issueReset(account.id),
                  (issued) =>
                    setShown({
                      label: `Reset link for ${account.username}`,
                      issued,
                      resetOf: account.id,
                    }),
                )
              }
            >
              Reset link
            </button>
            <button
              type="button"
              className="button button-quiet"
              disabled={!account.resetPending}
              title={account.resetPending ? undefined : 'No pending reset link'}
              onClick={() => void revokeReset(account)}
            >
              Revoke reset link
            </button>
            <button
              type="button"
              className="button button-quiet"
              aria-expanded={devices?.userId === account.id}
              onClick={() =>
                devices?.userId === account.id ? setDevices(null) : void showDevices(account.id)
              }
            >
              Devices
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() =>
                void act(
                  () => api.endSessions(account.id),
                  () => setDevices(null),
                )
              }
            >
              Sign out everywhere
            </button>
            {account.id !== user.id &&
              (confirming === account.id ? (
                <button
                  type="button"
                  className="button"
                  onClick={() =>
                    void act(
                      () => api.deleteAccount(account.id),
                      () => forgetResetOf(account.id),
                    )
                  }
                >
                  Confirm deletion of {account.username}
                </button>
              ) : (
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setConfirming(account.id)}
                >
                  Delete
                </button>
              ))}
            {devices?.userId === account.id && (
              <ul className="admin-devices" aria-label={`Devices of ${account.username}`}>
                {devices.list.length === 0 && <li className="muted">No signed-in device.</li>}
                {devices.list.map((device) => (
                  <li key={device.id} className="admin-item">
                    <span title={device.userAgent ?? undefined}>
                      {deviceLabel(device.userAgent)}
                      <span className="muted"> · last seen {when(device.lastSeenAt)}</span>
                    </span>
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={() =>
                        void act(
                          () => api.endSessions(account.id, device.id),
                          () => void showDevices(account.id),
                        )
                      }
                    >
                      Sign out this device
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h3 className="admin-title">Sign-in activity</h3>
      <ol className="admin-list admin-events" aria-label="Sign-in activity">
        {events.map((event) => (
          <li key={event.id} className="admin-item">
            <time dateTime={event.at}>{when(event.at)}</time>
            <span>{event.kind.replaceAll('_', ' ')}</span>
            <span className="muted">
              {event.username ?? event.usernameTried ?? '—'} {event.ip ?? ''}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
