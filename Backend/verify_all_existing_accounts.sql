-- Verify all existing user accounts
-- This will mark all existing users as email verified
-- Run this script to verify all accounts that were created before email verification was implemented

-- Update all users to be verified
UPDATE users 
SET email_verified = 1,
    verification_token = NULL,
    verification_token_expiry = NULL
WHERE email_verified IS NULL 
   OR email_verified = 0;

-- Optional: If you want to see how many accounts were updated, run this query first:
-- SELECT COUNT(*) as unverified_count FROM users WHERE email_verified IS NULL OR email_verified = 0;

-- After running the update, verify the results:
-- SELECT COUNT(*) as verified_count FROM users WHERE email_verified = 1;
