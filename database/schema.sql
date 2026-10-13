CREATE TABLE IF NOT EXISTS `business_members` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role` VARCHAR(30) NOT NULL DEFAULT 'user',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_members_business_user` (`business_id`, `user_id`),
  KEY `idx_business_members_user` (`user_id`)
);

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NULL,
  `invoice_number` VARCHAR(100) NULL,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `tax` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `status` VARCHAR(30) NOT NULL DEFAULT 'unpaid',
  `invoice_date` DATE NULL,
  `due_date` DATE NULL,
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoices_business` (`business_id`),
  KEY `idx_invoices_customer` (`customer_id`)
);

CREATE TABLE IF NOT EXISTS `invoice_items` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id` INT UNSIGNED NOT NULL,
  `product_id` INT UNSIGNED NULL,
  `description` VARCHAR(255) NULL,
  `quantity` DECIMAL(12,2) NOT NULL DEFAULT 1,
  `price` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total` DECIMAL(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_items_invoice` (`invoice_id`),
  KEY `idx_invoice_items_product` (`product_id`)
);

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token` VARCHAR(1024) NULL,
  `expires_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_sessions_user` (`user_id`)
);

CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED NOT NULL,
  `product_id` INT UNSIGNED NOT NULL,
  `type` VARCHAR(30) NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL,
  `note` VARCHAR(255) NULL,
  `date` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_transactions_business` (`business_id`),
  KEY `idx_inventory_transactions_product` (`product_id`)
);

CREATE TABLE IF NOT EXISTS `payment_reminders` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL,
  `message` TEXT NULL,
  `reminder_date` DATETIME NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `sent_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payment_reminders_business` (`business_id`),
  KEY `idx_payment_reminders_customer` (`customer_id`)
);

CREATE TABLE IF NOT EXISTS `staff` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone` VARCHAR(15) NULL,
  `email` VARCHAR(150) NULL,
  `role` VARCHAR(50) NULL,
  `salary` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `join_date` DATE NULL,
  `attendance_date` DATE NULL,
  `attendance_status` VARCHAR(30) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_staff_business` (`business_id`)
);