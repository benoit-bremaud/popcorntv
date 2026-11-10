CREATE TABLE `title_links` (
	`kind` text NOT NULL,
	`tmdb_id` integer NOT NULL,
	`url` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`kind`, `tmdb_id`)
);
