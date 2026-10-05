-- Migration: Add phone_number to profiles for WhatsApp notifications
-- Format: E.164 (e.g., +5511999998888)

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Index for quick lookup when sending notifications
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone_number) WHERE phone_number IS NOT NULL;

COMMENT ON COLUMN profiles.phone_number IS 'WhatsApp number in E.164 format (e.g., +5511999998888). Used for draft turn notifications.';
