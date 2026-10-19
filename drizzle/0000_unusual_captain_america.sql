CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`to_email` text NOT NULL,
	`user_id` text,
	`statement_id` text,
	`subject` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`statement_id`) REFERENCES `statement`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_log_dedupe_key_unique` ON `email_log` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `email_queue_idx` ON `email_log` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by` text,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_unique` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_user_idx` ON `invitation` (`user_id`);--> statement-breakpoint
CREATE TABLE `job_run` (
	`id` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`summary` text DEFAULT '{}' NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `job_run_idx` ON `job_run` (`job`,`started_at`);--> statement-breakpoint
CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`start_period` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_sub_uq` ON `membership` (`user_id`,`subscription_id`);--> statement-breakpoint
CREATE TABLE `payment_method` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`account_name` text,
	`account_number` text,
	`qr_file` text,
	`qr_mime` text,
	`instructions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_method_kind_unique` ON `payment_method` (`kind`);--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`statement_id` text NOT NULL,
	`user_id` text NOT NULL,
	`destination_method_id` text NOT NULL,
	`sending_app` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`transaction_ref` text NOT NULL,
	`transaction_ref_norm` text NOT NULL,
	`transaction_date` integer NOT NULL,
	`notes` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`submitted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`decline_reason` text,
	`adjustment_note` text,
	FOREIGN KEY (`statement_id`) REFERENCES `statement`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`destination_method_id`) REFERENCES `payment_method`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `payment_statement_idx` ON `payment` (`statement_id`);--> statement-breakpoint
CREATE INDEX `payment_ref_idx` ON `payment` (`transaction_ref_norm`);--> statement-breakpoint
CREATE INDEX `payment_status_idx` ON `payment` (`status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statement` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`period` text NOT NULL,
	`subscription_name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`outstanding_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`issued_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`status` text DEFAULT 'UNPAID' NOT NULL,
	`cancelled_at` integer,
	`cancel_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `statement_reference_unique` ON `statement` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `statement_cycle_uq` ON `statement` (`user_id`,`subscription_id`,`period`);--> statement-breakpoint
CREATE INDEX `statement_status_due_idx` ON `statement` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `statement_user_idx` ON `statement` (`user_id`,`period`);--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ref_prefix` text NOT NULL,
	`fee_minor` integer NOT NULL,
	`currency` text DEFAULT 'PHP' NOT NULL,
	`issue_day` integer DEFAULT 1 NOT NULL,
	`due_day` integer DEFAULT 10 NOT NULL,
	`payment_instructions` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_ref_prefix_unique` ON `subscription` (`ref_prefix`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text NOT NULL,
	`emailVerified` integer,
	`image` text,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
