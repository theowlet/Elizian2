// ==================================
// REWARDS MODULE
// ==================================

import { CONFIG } from './config.js';
import { apiCall } from './api.js';
import { getCurrentUser } from './auth.js';
import { formatCurrency } from './utils.js';

// ==================================
// TIER MANAGEMENT
// ==================================
export function getCurrentTier() {
  const user = getCurrentUser();
  return user.current_tier || 'Ather';
}

export function getTierInfo(tierName) {
  const tiers = {
    'Ather': {
      name: 'Ather',
      color: '#B0BEC5',
      percentage: CONFIG.TIER_PERCENTAGES.Ather,
      benefits: ['Basic rewards', 'Event access'],
      nextTier: 'Nova',
      pointsRequired: 1000
    },
    'Nova': {
      name: 'Nova',
      color: '#64B5F6',
      percentage: CONFIG.TIER_PERCENTAGES.Nova,
      benefits: ['Enhanced rewards', 'Priority booking', 'Event access'],
      nextTier: 'Luminar',
      pointsRequired: 2500
    },
    'Luminar': {
      name: 'Luminar',
      color: '#9575CD',
      percentage: CONFIG.TIER_PERCENTAGES.Luminar,
      benefits: ['Premium rewards', 'VIP access', 'Exclusive events'],
      nextTier: 'Valiant',
      pointsRequired: 5000
    },
    'Valiant': {
      name: 'Valiant',
      color: '#66BB6A',
      percentage: CONFIG.TIER_PERCENTAGES.Valiant,
      benefits: ['Elite rewards', 'Concierge service', 'Private events'],
      nextTier: 'Echelon',
      pointsRequired: 10000
    },
    'Echelon': {
      name: 'Echelon',
      color: '#FFD54F',
      percentage: CONFIG.TIER_PERCENTAGES.Echelon,
      benefits: ['Maximum rewards', 'Personal concierge', 'Exclusive access', 'Pre-ordering'],
      nextTier: null,
      pointsRequired: null
    }
  };
  
  return tiers[tierName] || tiers['Ather'];
}

export function calculateTierProgress(currentPoints) {
  const currentTier = getCurrentTier();
  const tierInfo = getTierInfo(currentTier);
  
  if (tierInfo.nextTier) {
    const nextTierInfo = getTierInfo(tierInfo.nextTier);
    const progress = Math.min((currentPoints / nextTierInfo.pointsRequired) * 100, 100);
    
    return {
      currentTier,
      nextTier: tierInfo.nextTier,
      currentPoints,
      pointsRequired: nextTierInfo.pointsRequired,
      progress: Math.round(progress),
      pointsNeeded: Math.max(nextTierInfo.pointsRequired - currentPoints, 0)
    };
  }
  
  return {
    currentTier,
    nextTier: null,
    currentPoints,
    pointsRequired: null,
    progress: 100,
    pointsNeeded: 0
  };
}

// ==================================
// POINTS & REWARDS
// ==================================
export function calculateRewardPoints(amount, tier = null) {
  const userTier = tier || getCurrentTier();
  const percentage = CONFIG.TIER_PERCENTAGES[userTier] || CONFIG.TIER_PERCENTAGES.Ather || 1;
  return Math.floor((amount / CONFIG.TOKEN_VALUE) * percentage);
}

export function formatRewardPoints(points) {
  return `${points.toLocaleString()} points`;
}

export async function getUserRewards() {
  try {
    const result = await apiCall('/user/rewards');
    return result;
  } catch (error) {
    console.error('Error loading user rewards:', error);
    return { success: false, error: error.message };
  }
}

export async function redeemReward(rewardId) {
  try {
    const result = await apiCall('/user/redeem-reward', 'POST', { reward_id: rewardId });
    return result;
  } catch (error) {
    console.error('Error redeeming reward:', error);
    return { success: false, error: error.message };
  }
}

// ==================================
// REFERRAL SYSTEM
// ==================================
export function generateReferralCode() {
  const user = getCurrentUser();
  const userId = user.id || 'user';
  const timestamp = Date.now().toString(36);
  return `ELZ${userId.slice(-4)}${timestamp.slice(-4)}`.toUpperCase();
}

export async function getReferralStats() {
  try {
    const result = await apiCall('/user/referral-stats');
    return result;
  } catch (error) {
    console.error('Error loading referral stats:', error);
    return { success: false, error: error.message };
  }
}

export async function processReferral(referralCode) {
  try {
    const result = await apiCall('/user/process-referral', 'POST', { referral_code: referralCode });
    return result;
  } catch (error) {
    console.error('Error processing referral:', error);
    return { success: false, error: error.message };
  }
}

// ==================================
// REWARDS DISPLAY
// ==================================
export function renderTierProgress() {
  const tierProgress = calculateTierProgress(getCurrentUser().points || 0);
  const tierInfo = getTierInfo(tierProgress.currentTier);
  
  return `
    <div class="tier-progress-card">
      <div class="tier-header">
        <div class="tier-badge tier-${tierProgress.currentTier.toLowerCase()}">
          <span>${tierProgress.currentTier}</span>
        </div>
        <div class="tier-points">
          <span class="current-points">${formatRewardPoints(tierProgress.currentPoints)}</span>
        </div>
      </div>
      
      ${tierProgress.nextTier ? `
        <div class="progress-section">
          <div class="progress-label">
            <span>Progress to ${tierProgress.nextTier}</span>
            <span>${tierProgress.pointsNeeded} points needed</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${tierProgress.progress}%"></div>
          </div>
          <div class="progress-percentage">${tierProgress.progress}%</div>
        </div>
      ` : `
        <div class="max-tier">
          <p>🎉 You've reached the highest tier!</p>
        </div>
      `}
      
      <div class="tier-benefits">
        <h4>Current Benefits:</h4>
        <ul>
          ${tierInfo.benefits.map(benefit => `<li>${benefit}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

export function renderRewardsList(rewards) {
  if (!rewards || rewards.length === 0) {
    return `
      <div class="no-rewards">
        <p>No rewards available at the moment.</p>
        <p>Complete bookings to earn points!</p>
      </div>
    `;
  }
  
  return rewards.map(reward => `
    <div class="reward-card" onclick="redeemReward('${reward.id}')">
      <div class="reward-image">
        <img src="${reward.image_url || '/assets/reward-default.jpg'}" alt="${reward.name}">
      </div>
      <div class="reward-info">
        <h3>${reward.name}</h3>
        <p>${reward.description}</p>
        <div class="reward-meta">
          <span class="reward-cost">${formatRewardPoints(reward.points_required)}</span>
          <span class="reward-type">${reward.type}</span>
        </div>
      </div>
    </div>
  `).join('');
}

// ==================================
// EXPORTS FOR GLOBAL ACCESS
// ==================================
window.getCurrentTier = getCurrentTier;
window.getTierInfo = getTierInfo;
window.calculateTierProgress = calculateTierProgress;
window.calculateRewardPoints = calculateRewardPoints;
window.formatRewardPoints = formatRewardPoints;
window.getUserRewards = getUserRewards;
window.redeemReward = redeemReward;
window.generateReferralCode = generateReferralCode;
window.getReferralStats = getReferralStats;
window.processReferral = processReferral;
window.renderTierProgress = renderTierProgress;
window.renderRewardsList = renderRewardsList;
