CREATE TABLE `bill` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`note` text,
	`total_minor` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`split_method` text NOT NULL,
	`split_input` text NOT NULL,
	`split_result` text NOT NULL,
	`engine_version` integer DEFAULT 1 NOT NULL,
	`due_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`cancelled_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
DROP INDEX `statement_cycle_uq`;--> statement-breakpoint
ALTER TABLE `statement` ADD `bill_id` text REFERENCES bill(id);--> statement-breakpoint
ALTER TABLE `statement` ADD `link_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `statement_bill_user_uq` ON `statement` (`user_id`,`bill_id`) WHERE "statement"."bill_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `statement_cycle_uq` ON `statement` (`user_id`,`subscription_id`,`period`) WHERE "statement"."bill_id" is null;--> statement-breakpoint
ALTER TABLE `subscription` ADD `kind` text DEFAULT 'RECURRING' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_guest` integer DEFAULT false NOT NULL;