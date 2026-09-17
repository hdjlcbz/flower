CREATE TABLE `journal_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);

--> statement-breakpoint
INSERT OR IGNORE INTO journal_settings (key, value) SELECT 'owner_id', MIN(owner_id) FROM records HAVING COUNT(DISTINCT owner_id) = 1;
