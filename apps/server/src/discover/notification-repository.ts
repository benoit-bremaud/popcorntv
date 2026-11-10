import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import type {
  AppNotification,
  DiscoverKind,
  NotificationList,
  NotificationReason,
} from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { notifications } from '../db/schema.js';

/** `GET …/notifications` answers this many lines at most (spec wishlist-notifications R10). */
export const NOTIFICATIONS_SHOWN = 50;
/** Notifications older than this are purged at start (R10). */
export const NOTIFICATION_RETENTION_MS = 90 * 24 * 60 * 60_000;

/** What a new notification says (R9). */
export interface NewNotification {
  readonly profileId: string;
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
  readonly title: string;
  readonly reason: NotificationReason;
  readonly providerId: number | null;
  readonly providerName: string | null;
}

/** Reads and writes in-app notifications (UC28, ADR-0030). */
export class NotificationRepository {
  constructor(private readonly db: AppDatabase) {}

  add(notification: NewNotification, now: Date = new Date()): void {
    this.db
      .insert(notifications)
      .values({ ...notification, createdAt: now.toISOString() })
      .run();
  }

  /** The newest lines of a profile and its unread count. */
  list(profileId: string): NotificationList {
    const items: AppNotification[] = this.db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        tmdbId: notifications.tmdbId,
        title: notifications.title,
        reason: notifications.reason,
        providerId: notifications.providerId,
        providerName: notifications.providerName,
        createdAt: notifications.createdAt,
        readAt: notifications.readAt,
      })
      .from(notifications)
      .where(eq(notifications.profileId, profileId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(NOTIFICATIONS_SHOWN)
      .all();
    const [row] = this.db
      .select({ n: count() })
      .from(notifications)
      .where(and(eq(notifications.profileId, profileId), isNull(notifications.readAt)))
      .all();
    return { items, unread: row?.n ?? 0 };
  }

  /** Marks every unread line of a profile read. */
  markRead(profileId: string, now: Date = new Date()): void {
    this.db
      .update(notifications)
      .set({ readAt: now.toISOString() })
      .where(and(eq(notifications.profileId, profileId), isNull(notifications.readAt)))
      .run();
  }

  /** Forgets the lines older than the retention. */
  purge(now: Date = new Date()): void {
    const before = new Date(now.getTime() - NOTIFICATION_RETENTION_MS).toISOString();
    this.db.delete(notifications).where(lt(notifications.createdAt, before)).run();
  }
}
