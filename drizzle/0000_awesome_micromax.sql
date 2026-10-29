CREATE TABLE `account_login_attempts` (
	`email` text,
	`created` real
);
--> statement-breakpoint
CREATE TABLE `athlete_assignments` (
	`athlete_id` integer PRIMARY KEY NOT NULL,
	`manager_id` integer
);
--> statement-breakpoint
CREATE TABLE `athlete_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer,
	`title` text,
	`kind` text,
	`starts` real,
	`venue` text,
	`details` text,
	`status` text DEFAULT 'scheduled'
);
--> statement-breakpoint
CREATE TABLE `athlete_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer,
	`author` text,
	`body` text,
	`created` real
);
--> statement-breakpoint
CREATE TABLE `athlete_profiles` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`phone` text DEFAULT '',
	`sport` text DEFAULT 'Football',
	`position` text DEFAULT '',
	`club` text DEFAULT '',
	`hometown` text DEFAULT '',
	`bio` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`email` text,
	`subject` text,
	`message` text,
	`created` real,
	`status` text DEFAULT 'new',
	`notes` text DEFAULT '',
	`phone` text DEFAULT '',
	`updated` real
);
--> statement-breakpoint
CREATE TABLE `manager_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text,
	`reference` text,
	`detail` text,
	`created` real
);
--> statement-breakpoint
CREATE TABLE `newsletter` (
	`email` text PRIMARY KEY NOT NULL,
	`created` real
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`ref` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`items` text,
	`total` real,
	`status` text,
	`created` real,
	`phone` text DEFAULT '',
	`address` text DEFAULT '',
	`fulfilment` text DEFAULT 'collection',
	`notes` text DEFAULT '',
	`updated` real,
	`lines` text DEFAULT '[]',
	`customer_name` text DEFAULT '',
	`customer_notes` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user_id` integer,
	`expires` real,
	`last_seen` real
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`plan` text,
	`billing` text,
	`amount` real,
	`status` text,
	`created` real,
	`updated` real,
	`notes` text DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text,
	`email` text,
	`password` text,
	`verified` integer DEFAULT 0,
	`code` text,
	`expires` real,
	`sent` real DEFAULT 0,
	`attempts` integer DEFAULT 0,
	`created` real,
	`role` text DEFAULT 'athlete'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);