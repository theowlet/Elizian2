# Partner–Guest Messaging & Audit

## Overview

In-app messaging between **guests (users)** and **partners (venues)** is implemented with the following guarantees:

- **Storage**: Every message is stored in the database and **retained for audit**.
- **No application-level deletion**: The codebase does not delete individual messages; history is preserved.
- **Cascade**: Messages are tied to `venue_conversations`; if a conversation is removed (e.g. partner/user account deletion), messages cascade with it. For normal operation, all messages remain.

## Data Model

| Table                  | Purpose |
|------------------------|--------|
| `venue_conversations`  | One row per (partner, user) pair. |
| `venue_messages`       | One row per message: `conversation_id`, `sender_type` (`user` \| `partner`), `body`, `created_at`. |

Messages are never soft-deleted or purged by the application; the table is the audit log.

## API (Summary)

- **Guest (user token)**  
  - Get or create conversation: `GET /api/v1/partners/:partnerId/conversations/me`  
  - List messages: `GET /api/v1/conversations/:conversationId/messages`  
  - Send message: `POST /api/v1/conversations/:conversationId/messages`  

- **Partner (partner token)**  
  - List conversations: `GET /api/v1/partners/:partnerId/conversations`  
  - Get messages: `GET /api/v1/partners/:partnerId/conversations/:conversationId/messages`  
  - Send message: `POST /api/v1/partners/:partnerId/conversations/:conversationId/messages`  

All send/list operations read and write the same `venue_messages` table so both sides see the same history.

## Compliance Note

For compliance or retention policies, ensure:

1. **Backups** include `venue_conversations` and `venue_messages`.
2. **Do not** add application logic that deletes or truncates `venue_messages` without a formal retention policy and legal review.
3. The migration `2026-02-messaging-audit-comment.sql` documents the table as retained for audit.
