import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  AUTH_EVENT_KINDS,
  AVATAR_COLORS,
  DISCOVER_KINDS,
  LIBRARY_KINDS,
  MEDIA_KINDS,
  NOTIFICATION_REASONS,
  ROLES,
  STREAM_TYPES,
} from '@popcorntv/shared';
import type { CastMember, Genre, ProviderIds } from '@popcorntv/shared';

/** Persistence shape of the class diagram (04-class.md); tables derive from the entities. */

/** One row per registered media folder (`Library` entity). */
export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull(),
  kind: text('kind', { enum: LIBRARY_KINDS }).notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * One row per scanned file plus one per series (`Media` entity). `file_path` is the real
 * absolute path used for playback, unique per library; `relative_path` is what the API
 * exposes; `file_size` + `file_mtime_ms` are the re-scan fingerprint (spec 7b).
 */
export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    libraryId: text('library_id')
      .notNull()
      .references(() => libraries.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
    /** Display title: the parsed one until TMDB replaces it (ADR-0003). */
    title: text('title').notNull(),
    /**
     * The title as parsed from the file name, written by the scan only: the stable key that
     * groups episodes under their `series` row even after TMDB renamed `title`.
     */
    parsedTitle: text('parsed_title').notNull().default(''),
    year: integer('year'),
    filePath: text('file_path'),
    relativePath: text('relative_path'),
    fileSize: integer('file_size'),
    fileMtimeMs: integer('file_mtime_ms'),
    durationSec: integer('duration_sec'),
    season: integer('season'),
    episode: integer('episode'),
    episodeEnd: integer('episode_end'),
    seriesId: text('series_id'),
    providerIds: text('provider_ids', { mode: 'json' })
      .$type<ProviderIds>()
      .notNull()
      .default(sql`'{}'`),
    edition: text('edition'),
    part: integer('part'),
    // UC2 metadata (ADR-0003): all nullable, `metadata_fetched_at` null = never looked up.
    tmdbId: integer('tmdb_id'),
    overview: text('overview'),
    genres: text('genres', { mode: 'json' }).$type<readonly Genre[]>(),
    releaseDate: text('release_date'),
    runtimeMin: integer('runtime_min'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    cast: text('cast', { mode: 'json' }).$type<readonly CastMember[]>(),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    metadataFetchedAt: text('metadata_fetched_at'),
  },
  (table) => [
    uniqueIndex('media_library_file_idx').on(table.libraryId, table.filePath),
    index('media_series_idx').on(table.seriesId),
  ],
);

/** Technical streams of a file (`StreamInfo` entity), replaced whole on every re-probe. */
export const streams = sqliteTable('streams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mediaId: text('media_id')
    .notNull()
    .references(() => media.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  type: text('type', { enum: STREAM_TYPES }).notNull(),
  codec: text('codec').notNull(),
  width: integer('width'),
  height: integer('height'),
  language: text('language'),
});

/**
 * One row per account (`User` entity, spec auth §4.1). `username_key` is the lower-cased
 * username, unique so two accounts never read alike.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  usernameKey: text('username_key').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  createdAt: text('created_at').notNull(),
  lastLoginAt: text('last_login_at'),
});

/**
 * One row per signed-in device (`Session` entity, ADR-0010 §2). Only the SHA-256 of the
 * cookie token is stored; `expires_at` is the absolute limit, the idle one is
 * `last_seen_at` + 14 days.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    userAgent: text('user_agent'),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

/** Token kinds of `auth_tokens`: invitation and password reset links (ADR-0010 §1). */
export const AUTH_TOKEN_KINDS = ['invite', 'reset'] as const;

/** Single-use invitation and reset links (spec auth §4.1); the setup token is never stored. */
export const authTokens = sqliteTable('auth_tokens', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  kind: text('kind', { enum: AUTH_TOKEN_KINDS }).notNull(),
  role: text('role', { enum: ROLES }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  usedAt: text('used_at'),
  revokedAt: text('revoked_at'),
});

export type { AuthEventKind } from '@popcorntv/shared';

/** Audit trail (spec auth R9): no password, no token; purged after 90 days. */
export const authEvents = sqliteTable(
  'auth_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: text('at').notNull(),
    kind: text('kind', { enum: AUTH_EVENT_KINDS }).notNull(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    ip: text('ip'),
    usernameTried: text('username_tried'),
  },
  (table) => [index('auth_events_at_idx').on(table.at)],
);

/**
 * One row per household member (`Profile` entity, ADR-0008, ADR-0010 §5). `name_key` is
 * the lower-cased name, unique per user so two of their profiles never read alike.
 * `user_id` is null only between migration 0006 and the first-owner setup.
 */
export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    avatar: text('avatar', { enum: AVATAR_COLORS }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('profiles_user_name_idx').on(table.userId, table.nameKey)],
);

/** Where a profile stopped in a title (`WatchProgress` entity, ADR-0007 / ADR-0008). */
export const watchProgress = sqliteTable(
  'watch_progress',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    positionSec: integer('position_sec').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** Set when the profile marked the title watched by hand (spec watched-marks R2). */
    watchedAt: text('watched_at'),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.mediaId] })],
);

/**
 * A profile's wishlist (UC26, ADR-0020): one row per TMDB title, with the facts the row
 * shows read from TMDB when added. Availability shown is a join on `media.tmdb_id` at read
 * time (spec discover-wishlist R6); the `seen_*` columns hold what the availability check last
 * saw, so it notifies only on a change (spec wishlist-notifications R4).
 */
export const wishlist = sqliteTable(
  'wishlist',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    overview: text('overview').notNull(),
    voteAverage: real('vote_average').notNull(),
    posterPath: text('poster_path'),
    addedAt: text('added_at').notNull(),
    seenInLibrary: integer('seen_in_library', { mode: 'boolean' }).notNull().default(false),
    /** JSON array of counting provider ids last seen; null until the first check (R4). */
    seenProviderIds: text('seen_provider_ids', { mode: 'json' }).$type<number[]>(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.kind, table.tmdbId] })],
);

/** Shared durable title demand; it never implies a playable movie or episode (#309). */
export const preparationDemands = sqliteTable(
  'preparation_demands',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('preparation_demands_title_idx').on(t.kind, t.tmdbId),
    uniqueIndex('preparation_demands_identity_idx').on(t.id, t.kind, t.tmdbId),
    check(
      'preparation_demands_title_check',
      sql`${t.kind} IN ('movie', 'tv') AND ${t.tmdbId} BETWEEN 1 AND 2147483647 AND typeof(${t.tmdbId}) = 'integer'`,
    ),
  ],
);

/** Private subscription lifetime; deleting a wish cannot delete shared work. */
export const preparationInterests = sqliteTable(
  'preparation_interests',
  {
    id: text('id').primaryKey(),
    demandId: text('demand_id').notNull(),
    profileId: text('profile_id').notNull(),
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('preparation_interests_wish_idx').on(t.profileId, t.kind, t.tmdbId),
    index('preparation_interests_demand_idx').on(t.demandId),
    foreignKey({
      columns: [t.profileId, t.kind, t.tmdbId],
      foreignColumns: [wishlist.profileId, wishlist.kind, wishlist.tmdbId],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.demandId, t.kind, t.tmdbId],
      foreignColumns: [preparationDemands.id, preparationDemands.kind, preparationDemands.tmdbId],
    }),
  ],
);

/** Exact movie/episode identity and trusted local resolution, independent of clients. */
export const preparationTargets = sqliteTable(
  'preparation_targets',
  {
    id: text('id').primaryKey(),
    demandId: text('demand_id').notNull(),
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    /** -1/-1 is the movie sentinel; TV targets always identify a real episode. */
    season: integer('season').notNull(),
    episode: integer('episode').notNull(),
    resolution: text('resolution', {
      enum: ['unresolved', 'needs_preparation', 'already_playable'],
    })
      .notNull()
      .default('unresolved'),
    observedAtMs: integer('observed_at_ms'),
    validUntilMs: integer('valid_until_ms'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('preparation_targets_identity_idx').on(t.demandId, t.season, t.episode),
    foreignKey({
      columns: [t.demandId, t.kind, t.tmdbId],
      foreignColumns: [preparationDemands.id, preparationDemands.kind, preparationDemands.tmdbId],
    }),
    check(
      'preparation_targets_episode_check',
      sql`(${t.kind} = 'movie' AND ${t.season} = -1 AND ${t.episode} = -1) OR (${t.kind} = 'tv' AND typeof(${t.season}) = 'integer' AND typeof(${t.episode}) = 'integer' AND ${t.season} BETWEEN 0 AND 2147483647 AND ${t.episode} BETWEEN 1 AND 2147483647)`,
    ),
    check(
      'preparation_targets_resolution_check',
      sql`${t.resolution} IN ('unresolved', 'needs_preparation', 'already_playable') AND ((${t.resolution} = 'unresolved' AND ${t.observedAtMs} IS NULL AND ${t.validUntilMs} IS NULL) OR (${t.resolution} != 'unresolved' AND ${t.observedAtMs} IS NOT NULL AND ${t.validUntilMs} IS NOT NULL AND ${t.validUntilMs} > ${t.observedAtMs}))`,
    ),
  ],
);

/** Durable write-ahead attempt; uncertain outcomes block all subsequent submissions. */
export const preparationAttempts = sqliteTable(
  'preparation_attempts',
  {
    id: text('id').primaryKey(),
    targetId: text('target_id')
      .notNull()
      .references(() => preparationTargets.id),
    backend: text('backend').notNull(),
    state: text('state', { enum: ['uncertain', 'accepted', 'retired'] }).notNull(),
    upstreamReference: text('upstream_reference'),
    retirementReason: text('retirement_reason', { enum: ['not_accepted', 'finished'] }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('preparation_attempts_active_idx')
      .on(t.targetId)
      .where(sql`${t.state} != 'retired'`),
    check(
      'preparation_attempts_state_check',
      sql`(${t.state} = 'uncertain' AND ${t.upstreamReference} IS NULL AND ${t.retirementReason} IS NULL) OR (${t.state} = 'accepted' AND ${t.upstreamReference} IS NOT NULL AND ${t.retirementReason} IS NULL) OR (${t.state} = 'retired' AND ${t.retirementReason} IS NOT NULL AND ((${t.retirementReason} = 'not_accepted' AND ${t.upstreamReference} IS NULL) OR (${t.retirementReason} = 'finished' AND ${t.upstreamReference} IS NOT NULL)))`,
    ),
  ],
);

/** The streaming providers a profile subscribes to (UC29, spec wishlist-notifications R1). */
export const profileProviders = sqliteTable(
  'profile_providers',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id').notNull(),
    name: text('name').notNull(),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.providerId] })],
);

/** In-app notifications of a profile (UC28, ADR-0030); facts copied so a line outlives its source. */
export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    title: text('title').notNull(),
    reason: text('reason', { enum: NOTIFICATION_REASONS }).notNull(),
    providerId: integer('provider_id'),
    providerName: text('provider_name'),
    createdAt: text('created_at').notNull(),
    readAt: text('read_at'),
  },
  (table) => [index('notifications_profile_idx').on(table.profileId, table.createdAt)],
);

/** The owner's own link per TMDB title (UC30, ADR-0031); never fetched by the server. */
export const titleLinks = sqliteTable(
  'title_links',
  {
    kind: text('kind', { enum: DISCOVER_KINDS }).notNull(),
    tmdbId: integer('tmdb_id').notNull(),
    url: text('url').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.tmdbId] })],
);
