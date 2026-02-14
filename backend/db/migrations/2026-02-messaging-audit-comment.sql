-- Messaging audit: venue_messages is the system of record for partner–guest messages.
-- All messages are stored permanently (no application-level delete). Retain for compliance and audit.
COMMENT ON TABLE venue_messages IS 'Partner–guest in-app messages. Retained for audit; do not delete for compliance.';
