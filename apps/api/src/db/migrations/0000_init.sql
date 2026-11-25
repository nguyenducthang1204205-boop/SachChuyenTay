CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_user_idx` ON `admin_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`last_login_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `book_conditions` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`level` integer NOT NULL,
	`short_label` text NOT NULL,
	`description` text NOT NULL,
	`highlights` text DEFAULT '[]' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`publisher` text NOT NULL,
	`category_id` text NOT NULL,
	`condition_id` text NOT NULL,
	`price` integer NOT NULL,
	`original_price` integer,
	`published_year` integer,
	`pages` integer,
	`cover_from` text NOT NULL,
	`cover_to` text NOT NULL,
	`cover_ink` text,
	`cover_pattern` integer DEFAULT 0 NOT NULL,
	`cover_image_url` text,
	`rating` real DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`inspection_note` text DEFAULT '' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`is_published` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE cascade ON DELETE no action,
	FOREIGN KEY (`condition_id`) REFERENCES `book_conditions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "books_price_non_negative" CHECK("books"."price" >= 0),
	CONSTRAINT "books_stock_non_negative" CHECK("books"."stock" >= 0),
	CONSTRAINT "books_rating_range" CHECK("books"."rating" >= 0 AND "books"."rating" <= 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_sku_unique` ON `books` (`sku`);--> statement-breakpoint
CREATE INDEX `books_category_idx` ON `books` (`category_id`);--> statement-breakpoint
CREATE INDEX `books_condition_idx` ON `books` (`condition_id`);--> statement-breakpoint
CREATE INDEX `books_price_idx` ON `books` (`price`);--> statement-breakpoint
CREATE INDEX `books_created_at_idx` ON `books` (`created_at`);--> statement-breakpoint
CREATE TABLE `buyback_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`city` text NOT NULL,
	`method` text NOT NULL,
	`book_list` text NOT NULL,
	`book_count` integer NOT NULL,
	`pickup` integer DEFAULT false NOT NULL,
	`photo_keys` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buyback_requests_reference_unique` ON `buyback_requests` (`reference`);--> statement-breakpoint
CREATE INDEX `buyback_requests_status_idx` ON `buyback_requests` (`status`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`bg_color` text NOT NULL,
	`fg_color` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`percent` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	CONSTRAINT "coupons_percent_range" CHECK("coupons"."percent" > 0 AND "coupons"."percent" <= 100)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`source` text DEFAULT 'website' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_email_unique` ON `newsletter_subscribers` (`email`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`book_id` integer NOT NULL,
	`title` text NOT NULL,
	`unit_price` integer NOT NULL,
	`original_price` integer,
	`quantity` integer NOT NULL,
	`line_total` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_qty_positive" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`address` text NOT NULL,
	`note` text,
	`payment_method` text NOT NULL,
	`coupon_code` text,
	`coupon_label` text,
	`coupon_percent` integer,
	`subtotal` integer NOT NULL,
	`discount` integer NOT NULL,
	`shipping_fee` integer NOT NULL,
	`total` integer NOT NULL,
	`savings` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text,
	`search_text` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer) * 1000) NOT NULL,
	FOREIGN KEY (`coupon_code`) REFERENCES `coupons`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_code_unique` ON `orders` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_key_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_phone_idx` ON `orders` (`phone`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);