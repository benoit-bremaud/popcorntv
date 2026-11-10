import { useCallback, useEffect, useState } from 'react';
import type { AppNotification, NotificationList } from '@popcorntv/shared';
import { loadNotifications, markNotificationsRead } from '../api.js';

/** The bell polls this often (spec wishlist-notifications R11). */
export const NOTIFICATION_POLL_MS = 5 * 60_000;

/** The notification calls (UC28); injected by tests. */
export interface NotificationApi {
  readonly load: typeof loadNotifications;
  readonly markRead: typeof markNotificationsRead;
}

const notificationApi: NotificationApi = {
  load: loadNotifications,
  markRead: markNotificationsRead,
};

type Props = {
  readonly profileId: string;
  /** Opens the Discover title sheet of a line. */
  readonly onOpen: (notification: AppNotification) => void;
  readonly api?: NotificationApi;
};

/** What a line says (R11). */
export function notificationText(notification: AppNotification): string {
  return notification.reason === 'library'
    ? `${notification.title} is now in your library`
    : `${notification.title} is now on ${notification.providerName ?? 'one of your providers'}`;
}

/**
 * UC28: a bell with the unread count; opening it lists the lines and marks them read (ADR-0030).
 * Polled when the profile is picked and every five minutes.
 */
export function NotificationBell({
  profileId,
  onOpen,
  api = notificationApi,
}: Props): React.JSX.Element {
  const [list, setList] = useState<NotificationList>({ items: [], unread: 0 });
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList(await api.load(profileId));
    } catch {
      // A missed poll is harmless: the next one catches up.
    }
  }, [api, profileId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), NOTIFICATION_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function toggle(): Promise<void> {
    const opening = !expanded;
    setExpanded(opening);
    if (opening && list.unread > 0 && (await api.markRead(profileId))) {
      setList((current) => ({ ...current, unread: 0 }));
    }
  }

  return (
    <div className="bell">
      <button
        type="button"
        className="bell__button"
        aria-expanded={expanded}
        aria-controls="bell-panel"
        aria-label={list.unread > 0 ? `Notifications, ${list.unread} unread` : 'Notifications'}
        onClick={() => void toggle()}
      >
        <span aria-hidden="true">🔔</span>
        {list.unread > 0 && (
          <span className="bell__count" aria-hidden="true">
            {list.unread}
          </span>
        )}
      </button>
      {/* Kept mounted (hidden) so `aria-controls` always points at it. */}
      <div id="bell-panel" className="bell__panel" hidden={!expanded}>
        {list.items.length === 0 ? (
          <p className="muted">Nothing new on your list.</p>
        ) : (
          <ul className="bell__list">
            {list.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.readAt === null ? 'bell__item bell__item--new' : 'bell__item'}
                  onClick={() => {
                    setExpanded(false);
                    onOpen(item);
                  }}
                >
                  {notificationText(item)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
