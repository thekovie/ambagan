CREATE TABLE `penalty` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`late_days` integer NOT NULL,
	`applied_to_statement_id` text,
	`waived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`statement_id`) REFERENCES `statement`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`applied_to_statement_id`) REFERENCES `statement`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `penalty_statement_id_unique` ON `penalty` (`statement_id`);--> statement-breakpoint
CREATE INDEX `penalty_user_idx` ON `penalty` (`user_id`);--> statement-breakpoint
ALTER TABLE `statement` ADD `penalty_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription` ADD `penalty_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription` ADD `penalty_every_days` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription` ADD `penalty_cap_minor` integer;--> statement-breakpoint
ALTER TABLE `subscription` ADD `penalty_since` integer;