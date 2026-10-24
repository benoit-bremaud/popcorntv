CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`avatar` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_name_key_unique` ON `profiles` (`name_key`);--> statement-breakpoint
-- ADR-0008 §2: the seeded profile keeps the progress saved before profiles existed.
INSERT INTO `profiles` (`id`, `name`, `name_key`, `avatar`, `created_at`) VALUES ('default', 'Me', 'me', 'red', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_watch_progress` (
	`profile_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position_sec` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `media_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_watch_progress`("profile_id", "media_id", "position_sec", "updated_at") SELECT "profile_id", "media_id", "position_sec", "updated_at" FROM `watch_progress`;--> statement-breakpoint
DROP TABLE `watch_progress`;--> statement-breakpoint
ALTER TABLE `__new_watch_progress` RENAME TO `watch_progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;