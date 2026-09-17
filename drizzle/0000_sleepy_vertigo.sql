CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`position` integer NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_photos_record` ON `photos` (`record_id`,`position`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`city_code` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`flower` text DEFAULT '' NOT NULL,
	`meaning` text DEFAULT '' NOT NULL,
	`story` text DEFAULT '' NOT NULL,
	`deleted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`write_token` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_owner_date` ON `records` (`owner_id`,`date`);