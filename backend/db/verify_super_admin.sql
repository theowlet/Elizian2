-- ============================================
-- Verify Super Admin Account
-- Run this to check if super admin was created
-- ============================================

-- Check super admin by email (works with or without role_id column)
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.phone_number,
    u.created_at,
    CASE 
        WHEN c.password_hash IS NOT NULL THEN 'Password set ✓' 
        ELSE 'No password ✗' 
    END as password_status,
    c.email_verified,
    CASE 
        WHEN c.email_verified = true THEN 'Email verified ✓'
        ELSE 'Email not verified ✗'
    END as email_status
FROM users u
LEFT JOIN user_auth_credentials c ON u.id = c.user_id
WHERE LOWER(u.email) = LOWER('mailfornishantverma@gmail.com');

-- Alternative: Check all users with email and password (likely super admins)
SELECT 
    u.id,
    u.email,
    u.first_name,
    u.last_name,
    u.phone_number,
    u.created_at,
    CASE 
        WHEN c.password_hash IS NOT NULL THEN 'Password set ✓' 
        ELSE 'No password ✗' 
    END as password_status,
    c.email_verified
FROM users u
LEFT JOIN user_auth_credentials c ON u.id = c.user_id
WHERE u.email IS NOT NULL AND c.password_hash IS NOT NULL
ORDER BY u.created_at DESC;

