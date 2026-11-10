import type { FastifyBaseLogger } from 'fastify';
import { COUNTING_OFFER_TYPES } from '@popcorntv/shared';
import type { DiscoverKind, NotificationReason, WatchProviders } from '@popcorntv/shared';
import { startSerialTimer } from '../timer.js';
import type { TimerFns } from '../timer.js';
import { PROVIDERS_MAX } from './routes.js';
import type { MyProviderRepository } from './my-provider-repository.js';
import type { NotificationRepository } from './notification-repository.js';
import type { CheckRow, WishlistRepository } from './wishlist-repository.js';

/** What a source state looks like to the check; `providerIds` null = not known (R4, R7). */
export interface Availability {
  readonly inLibrary: boolean;
  readonly providerIds: readonly number[] | null;
}

/** One change worth a notification (spec wishlist-notifications R5). */
export interface AvailabilityEvent {
  readonly reason: NotificationReason;
  readonly providerId: number | null;
}

/**
 * The events between what a row last saw and what is there now (R5): the library when it
 * arrived, each of `mine` newly offered. An unknown side (`null`) raises no provider event.
 */
export function availabilityEvents(
  seen: Availability,
  current: Availability,
  mine: ReadonlySet<number>,
): AvailabilityEvent[] {
  const events: AvailabilityEvent[] = [];
  if (current.inLibrary && !seen.inLibrary) events.push({ reason: 'library', providerId: null });
  if (seen.providerIds !== null && current.providerIds !== null) {
    const before = new Set(seen.providerIds);
    for (const id of current.providerIds) {
      if (!before.has(id) && mine.has(id)) events.push({ reason: 'provider', providerId: id });
    }
  }
  return events;
}

/** The ids of the providers whose offer counts (R3), each once, ascending. */
export function countingProviders(answer: WatchProviders): number[] {
  const ids = answer.offers
    .filter((offer) => COUNTING_OFFER_TYPES.includes(offer.type))
    .map((offer) => offer.providerId);
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** What a check run needs; `buildApp` wires the real ones, tests fakes. */
export interface AvailabilityCheckDeps {
  readonly wishlist: Pick<WishlistRepository, 'checkRows' | 'saveSeen'>;
  readonly notifications: Pick<NotificationRepository, 'add' | 'purge'>;
  readonly myProviders: Pick<MyProviderRepository, 'idsByProfile'>;
  /** The French offers of a title (the shared providers cache), null without TMDB (R7). */
  readonly offers: ((kind: DiscoverKind, tmdbId: number) => Promise<WatchProviders>) | null;
  readonly logger: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

/** Groups rows by title so each title is looked up once. */
function byTitle(rows: readonly CheckRow[]): Map<string, CheckRow[]> {
  const groups = new Map<string, CheckRow[]>();
  for (const row of rows) {
    const key = `${row.kind}:${row.tmdbId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

/**
 * One check run (R5–R8, R10): every wishlisted title in turn, its offers read once (for the first
 * `PROVIDERS_MAX` titles, the memo's size), then each profile row diffed, saved and notified. A
 * TMDB failure skips the provider side of a title. Old notifications are purged at the end.
 */
export async function checkAvailability(
  deps: AvailabilityCheckDeps,
  stopped: () => boolean = () => false,
): Promise<void> {
  const mineByProfile = deps.myProviders.idsByProfile();
  let titles = 0;
  let notified = 0;
  let failed = 0;
  for (const rows of byTitle(deps.wishlist.checkRows()).values()) {
    if (stopped()) break;
    const [first] = rows;
    if (first === undefined) continue;
    titles += 1;
    let answer: WatchProviders | null = null;
    if (deps.offers && titles <= PROVIDERS_MAX) {
      try {
        // One title at a time on purpose: keeps the TMDB load low (#279).
        answer = await deps.offers(first.kind, first.tmdbId); // NOSONAR
      } catch (error) {
        failed += 1;
        deps.logger.warn(
          {
            event: 'wishlist.check.title_failed',
            kind: first.kind,
            tmdbId: first.tmdbId,
            err: error,
          },
          'wishlist check failed for a title',
        );
      }
    }
    const providerIds = answer === null ? null : countingProviders(answer);
    for (const row of rows) {
      const seen = { inLibrary: row.seenInLibrary, providerIds: row.seenProviderIds };
      const current = { inLibrary: row.mediaId !== null, providerIds };
      const mine = mineByProfile.get(row.profileId) ?? new Set<number>();
      // Saved first: a row removed during the run raises nothing (extension 2b), and a crash
      // between the two writes loses a line rather than repeating it.
      if (!deps.wishlist.saveSeen(row, current.inLibrary, providerIds ?? seen.providerIds)) {
        continue;
      }
      for (const event of availabilityEvents(seen, current, mine)) {
        const providerName =
          answer?.offers.find((offer) => offer.providerId === event.providerId)?.name ?? null;
        deps.notifications.add({
          profileId: row.profileId,
          kind: row.kind,
          tmdbId: row.tmdbId,
          title: row.title,
          reason: event.reason,
          providerId: event.providerId,
          providerName,
        });
        notified += 1;
        deps.logger.info(
          {
            event: 'notification.created',
            profileId: row.profileId,
            reason: event.reason,
            kind: row.kind,
            tmdbId: row.tmdbId,
            providerId: event.providerId,
          },
          'notification created',
        );
      }
    }
  }
  deps.notifications.purge();
  deps.logger.info(
    { event: 'wishlist.check.done', titles, notified, failed },
    'wishlist check done',
  );
}

/** UC28's check on a timer (R6, ADR-0016 pattern); returns the awaitable stop function. */
export function startAvailabilityCheck(
  deps: AvailabilityCheckDeps & TimerFns & { readonly intervalMin: number },
): () => Promise<void> {
  return startSerialTimer(
    deps.intervalMin,
    (stopped) => checkAvailability(deps, stopped),
    (error) =>
      deps.logger.warn({ event: 'wishlist.check.failed', err: error }, 'wishlist check failed'),
    deps,
  );
}
