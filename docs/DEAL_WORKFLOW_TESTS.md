# Deal Workflow Test Checklist

Use the scenarios below to verify the deal creation, approval, and promotion pipeline.

1. **Create Deal – Valid Discounts**
   - Original price 1000, percent 10 → discounted 900.
   - Original price 1000, amount 200 → discounted 800.
   - Attempt negative/over-discount values → API rejects.

2. **Create Deal – Applicable Days**
   - Missing or empty list defaults to all 7 days.
   - Invalid entries (e.g. “funday”) are ignored.

3. **Create Deal – Date Validation**
   - Start date in the past → HTTP 400.
   - End date before start date → HTTP 400.
   - Start date = now, end date future → succeeds.

4. **Approval Workflow**
   - With `deal_approval_required=true`, partner deal -> `is_active=false`.
   - Admin approve future-dated deal → stays upcoming, start_date unchanged.
   - Admin approve deal without start_date → start_date set to current timestamp.
   - Admin approve expired deal → request rejected.

5. **Promotion Workflow**
   - Partner requests trending (`request_trending=true`) → `featured_request_pending=true`.
   - Admin approve trending for eligible partner → `is_promoted=true`.
   - Admin force promotion (`force=true`) for ineligible partner → succeeds with audit entry.
   - Admin demote → `is_promoted=false`, `forced_by_admin=false`.

6. **Suspend / Reject**
   - Admin reject → `is_active=false` but record remains.
   - Admin suspend an active deal → `is_active=false`, audit logged.

7. **Redemption Limit (manual)**
   - Simulate user redemption until `max_redemptions`.
   - Additional redemption attempts should be blocked and deal auto-inactivated.

8. **Public Visibility**
   - Approved live deals appear on `/api/v1/offers`.
   - Upcoming deals remain hidden from public but visible in admin with “UPCOMING” badge.
   - Expired deals are excluded from public results.

Follow these tests on both `localhost` and the Vercel deployment to ensure parity.

