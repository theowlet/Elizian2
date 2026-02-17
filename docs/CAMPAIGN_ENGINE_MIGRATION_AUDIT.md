# Campaign Engine Migration — Phase 1 Audit

## 1. Files Involved (Promotional Campaign System)

| Category | Files |
|----------|-------|
| **Backend** | promoCampaignController.js, promoCampaignService.js, promoCampaignRepository.js, growthEngine.js, collectionsRoutes.js |
| **DB** | 2026-02-campaign-architecture.sql (campaigns, campaign_experience_mapping, experience_tags, experience_tag_mapping, campaign_audit_log) |
| **Frontend** | HomePage.jsx (activeCampaigns, loadCampaigns, dynamic campaign sections), AdminDashboard.jsx (Campaign Manager section) |

## 2. Legacy Promotional Logic (To Replace/Remove)

| Item | Location | Action |
|------|----------|--------|
| is_trending | partner_offers, offerRepository, responseNormalizer, HomePage | Migrate to campaign-driven visibility |
| approved_for_featured | partners, adminRepository, AdminDashboard, PartnerConsole | Deprecate; replace with campaign targeting |
| featured_request_pending | partner_offers, adminService | Deprecate |
| promoCampaign* | Backend | Replace with new campaign engine |
| growthEngine | Backend | Replace with rule engine |

## 3. Partner Notification Campaigns (KEEP — Different Purpose)

| Item | Purpose |
|------|---------|
| campaignRepository.js | partner_notification_campaigns — push messages to guests |
| campaignService.js | Draft → Send flow for notifications |
| campaignController.js | Partner-scoped CRUD |
| partnerRoutes.js | GET/POST /:id/campaigns |

**Action:** Keep. Rename if needed to avoid confusion (e.g. notificationCampaigns).

## 4. API Endpoints

| Endpoint | Purpose | Action |
|----------|---------|--------|
| GET /api/v1/collections/active-campaigns | Promotional sections | Replace with new engine API |
| GET /api/v1/admin/partners/:id/featured-eligibility | Legacy | Deprecate after migration |
| PUT /api/v1/admin/partners/:id/featured-eligibility | Legacy | Deprecate after migration |

## 5. DB Tables

| Table | Action |
|-------|--------|
| campaigns (2026-02) | Replace with new schema |
| campaign_experience_mapping | Rename to campaign_experiences |
| experience_tags, experience_tag_mapping | Keep for tagging; integrate with campaigns |
| campaign_audit_log | Keep; extend |
| partner_notification_campaigns | Keep (messaging) |
| partner_offers.is_trending | Soft-deprecate; campaign engine drives visibility |
| partners.approved_for_featured | Soft-deprecate |

## 6. Hardcoded Labels

| Label | Location |
|-------|----------|
| "🔥 Trending Experiences" | HomePage.jsx |
| "Trending" badge on cards | HomePage.jsx, ExperienceCard.jsx |

**Action:** Keep as fallback when campaign name = "Trending"; otherwise use campaign.name.
