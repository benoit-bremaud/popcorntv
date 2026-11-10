CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`reason` text NOT NULL,
	`provider_id` integer,
	`provider_name` text,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_profile_idx` ON `notifications` (`profile_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `profile_providers` (
	`profile_id` text NOT NULL,
	`provider_id` integer NOT NULL,
	`name` text NOT NULL,
	PRIMARY KEY(`profile_id`, `provider_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `wishlist` ADD `seen_in_library` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `wishlist` ADD `seen_provider_ids` text;--> statement-breakpoint
-- Existing rows start from what is on disk now, so the first check does not notify them (R4).
UPDATE `wishlist` SET `seen_in_library` = 1 WHERE EXISTS (SELECT 1 FROM `media` WHERE `media`.`tmdb_id` = `wishlist`.`tmdb_id` AND `media`.`kind` = CASE `wishlist`.`kind` WHEN 'movie' THEN 'film' ELSE 'series' END);
