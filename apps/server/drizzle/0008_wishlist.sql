CREATE TABLE `wishlist` (
	`profile_id` text NOT NULL,
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`overview` text NOT NULL,
	`vote_average` real NOT NULL,
	`poster_path` text,
	`added_at` text NOT NULL,
	PRIMARY KEY(`profile_id`, `kind`, `tmdb_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
