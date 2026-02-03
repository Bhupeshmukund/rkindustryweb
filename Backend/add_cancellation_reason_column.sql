-- Add cancellation_reason column to orders table
ALTER TABLE orders 
ADD COLUMN cancellation_reason TEXT NULL AFTER status;

