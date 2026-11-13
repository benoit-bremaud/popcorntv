CREATE TABLE `preparation_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`backend` text NOT NULL,
	`state` text NOT NULL,
	`upstream_reference` text,
	`retirement_reason` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`target_id`) REFERENCES `preparation_targets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preparation_attempts_state_check" CHECK(("preparation_attempts"."state" = 'uncertain' AND "preparation_attempts"."upstream_reference" IS NULL AND "preparation_attempts"."retirement_reason" IS NULL) OR ("preparation_attempts"."state" = 'accepted' AND "preparation_attempts"."upstream_reference" IS NOT NULL AND "preparation_attempts"."retirement_reason" IS NULL) OR ("preparation_attempts"."state" = 'retired' AND "preparation_attempts"."retirement_reason" IS NOT NULL AND (("preparation_attempts"."retirement_reason" = 'not_accepted' AND "preparation_attempts"."upstream_reference" IS NULL) OR ("preparation_attempts"."retirement_reason" = 'finished' AND "preparation_attempts"."upstream_reference" IS NOT NULL))))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preparation_attempts_active_idx` ON `preparation_attempts` (`target_id`) WHERE "preparation_attempts"."state" != 'retired';--> statement-breakpoint
CREATE TABLE `preparation_demands` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "preparation_demands_title_check" CHECK("preparation_demands"."kind" IN ('movie', 'tv') AND "preparation_demands"."tmdb_id" BETWEEN 1 AND 2147483647 AND typeof("preparation_demands"."tmdb_id") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preparation_demands_title_idx` ON `preparation_demands` (`kind`,`tmdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `preparation_demands_identity_idx` ON `preparation_demands` (`id`,`kind`,`tmdb_id`);--> statement-breakpoint
CREATE TABLE `preparation_interests` (
	`id` text PRIMARY KEY NOT NULL,
	`demand_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`profile_id`,`kind`,`tmdb_id`) REFERENCES `wishlist`(`profile_id`,`kind`,`tmdb_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`demand_id`,`kind`,`tmdb_id`) REFERENCES `preparation_demands`(`id`,`kind`,`tmdb_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preparation_interests_wish_idx` ON `preparation_interests` (`profile_id`,`kind`,`tmdb_id`);--> statement-breakpoint
CREATE INDEX `preparation_interests_demand_idx` ON `preparation_interests` (`demand_id`);--> statement-breakpoint
CREATE TABLE `preparation_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`demand_id` text NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`season` integer NOT NULL,
	`episode` integer NOT NULL,
	`resolution` text DEFAULT 'unresolved' NOT NULL,
	`observed_at_ms` integer,
	`valid_until_ms` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`demand_id`,`kind`,`tmdb_id`) REFERENCES `preparation_demands`(`id`,`kind`,`tmdb_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "preparation_targets_episode_check" CHECK(("preparation_targets"."kind" = 'movie' AND "preparation_targets"."season" = -1 AND "preparation_targets"."episode" = -1) OR ("preparation_targets"."kind" = 'tv' AND typeof("preparation_targets"."season") = 'integer' AND typeof("preparation_targets"."episode") = 'integer' AND "preparation_targets"."season" BETWEEN 0 AND 2147483647 AND "preparation_targets"."episode" BETWEEN 1 AND 2147483647)),
	CONSTRAINT "preparation_targets_resolution_check" CHECK("preparation_targets"."resolution" IN ('unresolved', 'needs_preparation', 'already_playable') AND (("preparation_targets"."resolution" = 'unresolved' AND "preparation_targets"."observed_at_ms" IS NULL AND "preparation_targets"."valid_until_ms" IS NULL) OR ("preparation_targets"."resolution" != 'unresolved' AND "preparation_targets"."observed_at_ms" IS NOT NULL AND "preparation_targets"."valid_until_ms" IS NOT NULL AND "preparation_targets"."valid_until_ms" > "preparation_targets"."observed_at_ms")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preparation_targets_identity_idx` ON `preparation_targets` (`demand_id`,`season`,`episode`);
--> statement-breakpoint
INSERT INTO preparation_demands (id, kind, tmdb_id, created_at)
SELECT lower(hex(randomblob(16))), kind, tmdb_id, min(added_at)
FROM wishlist GROUP BY kind, tmdb_id;
--> statement-breakpoint
INSERT INTO preparation_interests (id, demand_id, profile_id, kind, tmdb_id, created_at)
SELECT lower(hex(randomblob(16))), d.id, w.profile_id, w.kind, w.tmdb_id, w.added_at
FROM wishlist w JOIN preparation_demands d ON d.kind = w.kind AND d.tmdb_id = w.tmdb_id;
