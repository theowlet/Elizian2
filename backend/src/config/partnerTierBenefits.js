/**
 * Partner subscription tier (Elizian ↔ Partner relationship).
 * Bronze / Silver / Gold: benefits from the platform. Set by Elizian (admin).
 * Separate from user loyalty tiers (Ather, Nova, Luminar, Valiant, Echelon in loyalty_tiers / users.current_tier_name). No naming or logic clash.
 */

const PARTNER_TIERS = ['bronze', 'silver', 'gold'];

const BENEFITS = {
  bronze: {
    label: 'Bronze Partner',
    description: 'Entry-level partnership with Elizian.',
    benefits: [
      'Listing on Elizian app and map',
      'Basic analytics and booking management',
      'Standard support',
      'Offer and campaign creation',
      'Trending: admin can override to mark deals as Trending',
    ],
  },
  silver: {
    label: 'Silver Partner',
    description: 'Enhanced visibility and support.',
    benefits: [
      'Everything in Bronze',
      'Higher placement in discovery when relevant',
      'Priority support',
      'Request deal to be Trending (admin approves with reason)',
      'Guest CRM and messaging',
    ],
  },
  gold: {
    label: 'Gold Partner',
    description: 'Premium partnership benefits.',
    benefits: [
      'Everything in Silver',
      'All deals auto-Trending; premium placement',
      'Dedicated account support',
      'Early access to new platform features',
      'Co-marketing and campaign support',
    ],
  },
};

function getPartnerTierBenefits(partnerTier) {
  const tier = (partnerTier || 'bronze').toLowerCase();
  const config = BENEFITS[tier] || BENEFITS.bronze;
  return {
    tier: tier,
    label: config.label,
    description: config.description,
    benefits: config.benefits,
  };
}

function getValidPartnerTiers() {
  return PARTNER_TIERS;
}

module.exports = {
  PARTNER_TIERS,
  BENEFITS,
  getPartnerTierBenefits,
  getValidPartnerTiers,
};
