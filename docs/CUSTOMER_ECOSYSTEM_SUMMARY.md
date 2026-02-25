# Customer Ecosystem Summary (Chat Header)

Backend and frontend behaviour for **GET /api/v1/customer/ecosystem-summary** and the dynamic customer chat header.

## 1. Lifetime spend and visits

- **lifetimeSpendFiat**: Sum of `bookings.fiat_amount` for the authenticated user. Only **non-cancelled** bookings are included (`status NOT IN ('cancelled')`). Confirmed, redeemed, completed, etc. all count.
- **totalVisits**: Count of those same bookings (one row = one visit).

Implemented in `backend/src/services/customerEcosystemService.js` (see file-header comment and the single query joining `users` and `bookings`).

## 2. EZT earned vs balance

- **totalEztEarned**: `users.total_tokens_earned` — lifetime EZT ever **awarded** (from spend/tier).
- **currentEztBalance**: `users.available_tokens` — current **spendable** EZT.
- **Difference**: `total_tokens_earned - available_tokens = total_tokens_spent` (what was used in redemptions).

So: earned = all-time credit; balance = what’s left; spent = earned − balance.

## 3. Realtime refetch (customer:ecosystem_updated)

When the customer’s ecosystem data changes, the backend emits to the **user’s room** so the chat header can refetch without a full reload:

- **Event**: `customer:ecosystem_updated` (see `REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED` in `backend/src/utils/realtimeEmitter.js`).
- **Room**: `users:${userId}` (same room the client joins after `join_user_room`).

**Emit locations** (all use `emitToRoom('users:' + userId, REALTIME_EVENTS.CUSTOMER_ECOSYSTEM_UPDATED, { reason })`):

| Reason                 | Service / file |
|------------------------|----------------|
| Tokens earned          | `tokenService.js` (after awarding EZT) |
| Tokens redeemed        | `tokenService.js` (after redeemTokens) |
| Loyalty updated        | `loyaltyEngineService.js` (after recordActivity) |
| Offer redeemed         | `enhancedRedemptionService.js` (after COMMIT, single-step redemption) |
| Redemption confirmed   | `redemptionConfirmationService.js` (after customer confirms pending redemption) |

Frontend: `socketService.js` subscribes to `customer:ecosystem_updated` (and `tokens:updated`, `loyalty:updated`) and dispatches a DOM event; `CustomerChatHeader.jsx` listens and calls `refetch()` from `useEcosystemSummary()`.
