-- Add email verification columns to users table
-- Run this script on production database to add email verification functionality
-- Note: MySQL doesn't support IF NOT EXISTS in ALTER TABLE, so run each statement separately
-- If a column already exists, you'll get an error which you can ignore

-- Add email verification columns
ALTER TABLE users ADD COLUMN verification_token VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN verification_token_expiry DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verified TINYINT(1) DEFAULT 0;
ALTER TABLE users ADD COLUMN last_verification_sent DATETIME NULL;

-- Add password reset columns
ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN password_reset_token_expiry DATETIME NULL;

-- Optional: Update existing users to have email_verified = 1 (mark all existing users as verified)
-- Uncomment the line below if you want to mark all existing users as verified
-- UPDATE users SET email_verified = 1 WHERE email_verified IS NULL OR email_verified = 0;
