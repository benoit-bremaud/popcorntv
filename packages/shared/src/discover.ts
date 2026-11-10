/** Contracts of UC26 Discover and the wishlist (spec discover-wishlist, ADR-0020). */

/** TMDB's two title kinds; `movie` matches a local `film`, `tv` a local `series`. */
export const DISCOVER_KINDS = ['movie', 'tv'] as const;
export type DiscoverKind = (typeof DISCOVER_KINDS)[number];

/** The TMDB lists the Discover rows show (spec R1). */
export const DISCOVER_LISTS = ['trending', 'popular'] as const;
export type DiscoverList = (typeof DISCOVER_LISTS)[number];

/** A TMDB title as Discover shows it. */
export interface DiscoverTitle {
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
  readonly title: string;
  readonly year: number | null;
  readonly overview: string;
  readonly voteAverage: number;
  /** TMDB poster path (`/abc.jpg`), served by `GET /discover/poster/:file`; null when none. */
  readonly posterPath: string | null;
  /** The local `film` / `series` with this `tmdb_id`, else null (spec R4). */
  readonly mediaId: string | null;
}

/** `GET /discover/:kind/:tmdbId`: the title sheet (spec R3). */
export interface DiscoverDetails extends DiscoverTitle {
  readonly genres: readonly string[];
  /** The first ten billed cast names. */
  readonly cast: readonly string[];
}

/** One entry of `GET /profiles/:profileId/wishlist`; `mediaId` set = available (spec R6). */
export interface WishlistEntry extends DiscoverTitle {
  readonly addedAt: string;
}

/** Offer types of UC27, in the order the sheet shows them (spec where-to-watch R1). */
export const WATCH_OFFER_TYPES = ['flatrate', 'free', 'ads', 'rent', 'buy'] as const;
export type WatchOfferType = (typeof WATCH_OFFER_TYPES)[number];

/** One legal offer in France; `providerId` is TMDB's stable id (spec R9, #277). */
export interface WatchOffer {
  readonly providerId: number;
  readonly name: string;
  /** TMDB logo path, served by `GET /discover/logo/:file`; null when none. */
  readonly logoPath: string | null;
  readonly type: WatchOfferType;
}

/** `GET /discover/:kind/:tmdbId/providers` (spec R1); `link` is the TMDB watch page (ADR-0029). */
export interface WatchProviders {
  readonly link: string | null;
  readonly offers: readonly WatchOffer[];
}

/** Offer types that make a title "available on a provider" (spec wishlist-notifications R3). */
export const COUNTING_OFFER_TYPES: readonly WatchOfferType[] = ['flatrate', 'free', 'ads'];

/** A provider a profile subscribes to (spec wishlist-notifications R1). */
export interface MyProvider {
  readonly providerId: number;
  readonly name: string;
}

/** Body of `PUT /profiles/:profileId/providers/:providerId`. */
export type MyProviderBody = Omit<MyProvider, 'providerId'>;

/** A profile may mark this many providers at most (spec wishlist-notifications R1). */
export const MY_PROVIDERS_MAX = 50;

/** Why a notification was raised (spec wishlist-notifications R9). */
export const NOTIFICATION_REASONS = ['library', 'provider'] as const;
export type NotificationReason = (typeof NOTIFICATION_REASONS)[number];

/** One in-app notification (ADR-0030); `providerId` / `providerName` set for `provider` only. */
export interface AppNotification {
  readonly id: number;
  readonly kind: DiscoverKind;
  readonly tmdbId: number;
  readonly title: string;
  readonly reason: NotificationReason;
  readonly providerId: number | null;
  readonly providerName: string | null;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** `GET /profiles/:profileId/notifications` (spec wishlist-notifications R10). */
export interface NotificationList {
  readonly items: readonly AppNotification[];
  readonly unread: number;
}
