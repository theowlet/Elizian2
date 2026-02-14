-- ============================================
-- MESSAGING WHATSAPP-STYLE UPGRADE
-- Migration: 2026-02-messaging-whatsapp-upgrade.sql
--
-- Adds:
--   1. Read receipts: status (sent/delivered/read), delivered_at, read_at
--   2. Soft delete: deleted_at, deleted_by_type
--   3. Unread count support via last_read_at per participant
--   4. Performance indexes
-- ============================================

-- ─── 1. Add message status + read receipts to venue_messages ──────────
ALTER TABLE venue_messages ADD COLUMN IF NOT EXISTS status VARCHAR(12) DEFAULT 'sent'
  CHECK (status IN ('sent', 'delivered', 'read'));
ALTER TABLE venue_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP;
ALTER TABLE venue_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;

-- ─── 2. Add soft delete columns to venue_messages ─────────────────────
-- Messages can only be deleted by sender before the recipient reads them
ALTER TABLE venue_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE venue_messages ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(10)
  CHECK (deleted_by IN ('user', 'partner'));

-- ─── 3. Add last_read tracking per participant on conversation ────────
-- Tracks the timestamp of the last message each participant has read
ALTER TABLE venue_conversations ADD COLUMN IF NOT EXISTS user_last_read_at TIMESTAMP;
ALTER TABLE venue_conversations ADD COLUMN IF NOT EXISTS partner_last_read_at TIMESTAMP;

-- ─── 4. Backfill existing messages as 'read' (since they existed before tracking) ──
UPDATE venue_messages SET status = 'read', delivered_at = created_at, read_at = created_at
WHERE status = 'sent' OR status IS NULL;

-- Backfill conversation last_read_at to latest message time
UPDATE venue_conversations vc SET
  user_last_read_at = (SELECT MAX(created_at) FROM venue_messages WHERE conversation_id = vc.id),
  partner_last_read_at = (SELECT MAX(created_at) FROM venue_messages WHERE conversation_id = vc.id)
WHERE user_last_read_at IS NULL;

-- ─── 5. Performance indexes ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_venue_messages_status ON venue_messages(status) WHERE status != 'read';
CREATE INDEX IF NOT EXISTS idx_venue_messages_unread ON venue_messages(conversation_id, sender_type, status) WHERE status != 'read' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venue_messages_created ON venue_messages(conversation_id, created_at DESC);
