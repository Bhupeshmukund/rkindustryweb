-- SQL Query to create rest_order table
-- Run this query in your MySQL database

CREATE TABLE IF NOT EXISTS `rest_order` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL COMMENT 'Customer name',
  `order_items` JSON NOT NULL COMMENT 'Array of order items stored as JSON',
  `address` VARCHAR(500) NOT NULL COMMENT 'Delivery address',
  `phone_no` VARCHAR(20) NOT NULL COMMENT 'Contact phone number',
  `amount` DECIMAL(10, 2) NOT NULL COMMENT 'Total order amount',
  `collection` VARCHAR(50) NOT NULL COMMENT 'Collection method (e.g., "delivery", "pickup")',
  `status` VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT 'Order status: pending, processing, ready, completed, cancelled',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Order creation timestamp',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last update timestamp',
  PRIMARY KEY (`id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Restaurant orders table';

-- Example of order_items JSON structure:
-- [
--   {
--     "item_name": "Pizza Margherita",
--     "quantity": 2,
--     "price": 299.00,
--     "notes": "Extra cheese"
--   },
--   {
--     "item_name": "Coca Cola",
--     "quantity": 1,
--     "price": 50.00
--   }
-- ]
