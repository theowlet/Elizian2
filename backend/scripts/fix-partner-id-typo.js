#!/usr/bin/env node
/**
 * Partner ID mismatch: Your URL has 917106 but the booking/partner use 917406.
 * The partner that EXISTS in the DB is: 29faba66-cf2d-4c83-83f6-9174068639ed
 * Partner 917106 does NOT exist.
 *
 * Fix: Log out and log back in. The login will return partner 917406.
 * Or use: http://localhost:8080/partner/console?partner_id=29faba66-cf2d-4c83-83f6-9174068639ed
 *
 * If you need 917106 to be the canonical ID, you must update the partners table
 * and all references (complex migration).
 */
console.log(`
Partner ID mismatch detected:
- URL shows: 29faba66-cf2d-4c83-83f6-9171068639ed (917106)
- Booking/Partner use: 29faba66-cf2d-4c83-83f6-9174068639ed (917406)

Only partner 917406 exists in the database. The booking belongs to that partner.

To see the booking:
1. Log out of the Partner Console
2. Log back in - you will get partner 917406
3. The booking should appear under Bookings

If you still see "No bookings", ensure the backend was restarted after the recent fix.
`);
