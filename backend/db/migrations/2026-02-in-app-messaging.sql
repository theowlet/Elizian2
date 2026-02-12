-- In-app messaging: consumer <-> venue
CREATE TABLE IF NOT EXISTS venue_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(partner_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_venue_conversations_partner ON venue_conversations(partner_id);
CREATE INDEX IF NOT EXISTS idx_venue_conversations_user ON venue_conversations(user_id);

CREATE TABLE IF NOT EXISTS venue_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES venue_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'partner')),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_venue_messages_conversation ON venue_messages(conversation_id);

COMMENT ON TABLE venue_conversations IS 'One conversation per user-venue pair for in-app messaging';
COMMENT ON TABLE venue_messages IS 'Messages in a venue conversation';
