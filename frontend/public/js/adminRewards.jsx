/**
 * Admin Rewards Management
 * Functions for viewing and managing user rewards in admin console
 */

const API_BASE = window.API_BASE || 'http://localhost:3000';

/**
 * View user's rewards summary
 */
async function viewUserRewards(userId) {
  try {
    const response = await fetch(`${API_BASE}/api/v1/admin/rewards/user/${userId}`, {
      headers: getHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to load rewards: ${response.status}`);
    }

    const result = await response.json();
    if (result.success && result.data) {
      showUserRewardsModal(result.data.user, result.data.rewards);
    } else {
      showNotification('Failed to load user rewards', 'error');
    }
  } catch (error) {
    console.error('Error loading user rewards:', error);
    showNotification('Error loading user rewards: ' + error.message, 'error');
  }
}

/**
 * Show user rewards modal
 */
function showUserRewardsModal(user, rewards) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modalBody');
  if (!modal || !modalBody) return;

  modalBody.innerHTML = `
    <div style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
        <div>
          <h2 style="margin: 0; color: #111827;">User Rewards & Tier</h2>
          <p style="margin: 4px 0 0; color: #6b7280; font-size: 14px;">
            ${user.first_name || ''} ${user.last_name || ''} (${user.email || user.phone_number || 'N/A'})
          </p>
        </div>
        <button onclick="closeModal()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
      </div>
      
      <!-- Tier Section (Prominent Display) -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; color: white; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px; font-size: 18px;">🎯 Membership Tier</h3>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Current Tier</div>
            <div style="font-size: 32px; font-weight: bold;">${rewards.tier?.current || 'Ather'}</div>
            <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">
              Earning Rate: ${parseFloat(rewards.tier?.earnRate || 1).toFixed(1)}% EZT
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Annual Spend</div>
            <div style="font-size: 24px; font-weight: bold;">₹${parseFloat(rewards.tier?.spending?.annual || 0).toLocaleString('en-IN')}</div>
            ${rewards.tier?.progress?.nextTier ? `
              <div style="font-size: 12px; opacity: 0.9; margin-top: 8px;">
                Next: ${rewards.tier.progress.nextTier} (₹${parseFloat(rewards.tier.progress.amountNeeded || 0).toLocaleString('en-IN')} more)
              </div>
            ` : '<div style="font-size: 12px; opacity: 0.9; margin-top: 8px;">Maximum tier reached</div>'}
          </div>
        </div>
      </div>

      <!-- EZT Section -->
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; padding: 20px; color: white; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px; font-size: 18px;">EZT Tokens</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Available Balance</div>
            <div style="font-size: 28px; font-weight: bold;">${parseFloat(rewards.ezt?.balance || 0).toFixed(5)}</div>
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Earned</div>
            <div style="font-size: 28px; font-weight: bold;">${parseFloat(rewards.ezt?.totalEarned || 0).toFixed(5)}</div>
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Spent</div>
            <div style="font-size: 28px; font-weight: bold;">${parseFloat(rewards.ezt?.totalSpent || 0).toFixed(5)}</div>
          </div>
        </div>
      </div>

      <!-- Loyalty Points Section -->
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px; padding: 20px; color: white; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px; font-size: 18px;">Loyalty Points</h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Available Balance</div>
            <div style="font-size: 28px; font-weight: bold;">${parseInt(rewards.loyaltyPoints?.balance || 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Earned</div>
            <div style="font-size: 28px; font-weight: bold;">${parseInt(rewards.loyaltyPoints?.totalEarned || 0).toLocaleString('en-IN')}</div>
          </div>
          <div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">Total Redeemed</div>
            <div style="font-size: 28px; font-weight: bold;">${parseInt(rewards.loyaltyPoints?.totalRedeemed || 0).toLocaleString('en-IN')}</div>
          </div>
        </div>
      </div>

      <!-- Tier Section -->
      <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px; color: #111827;">Membership Tier</h3>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Current Tier</div>
            <div style="font-size: 24px; font-weight: bold; color: #111827;">${rewards.tier?.current || 'Ather'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Earning Rate</div>
            <div style="font-size: 24px; font-weight: bold; color: #111827;">${parseFloat(rewards.tier?.earnRate || 1).toFixed(1)}%</div>
          </div>
        </div>
        ${rewards.tier?.progress?.nextTier ? `
          <div style="padding: 12px; background: white; border-radius: 8px; margin-top: 12px;">
            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Next Tier: ${rewards.tier.progress.nextTier}</div>
            <div style="font-size: 14px; color: #111827;">Spend ₹${parseFloat(rewards.tier.progress.amountNeeded || 0).toLocaleString('en-IN')} more to upgrade</div>
          </div>
        ` : ''}
      </div>

      <!-- Transaction History Tabs -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; gap: 8px; border-bottom: 2px solid #e5e7eb; margin-bottom: 16px;">
          <button class="rewards-tab active" data-tab="ezt" onclick="switchRewardsTab('ezt', '${user.id}')" style="padding: 12px 20px; background: none; border: none; border-bottom: 2px solid #667eea; color: #667eea; font-weight: 600; cursor: pointer;">EZT Transactions</button>
          <button class="rewards-tab" data-tab="loyalty" onclick="switchRewardsTab('loyalty', '${user.id}')" style="padding: 12px 20px; background: none; border: none; border-bottom: 2px solid transparent; color: #6b7280; font-weight: 600; cursor: pointer;">Loyalty Transactions</button>
          <button class="rewards-tab" data-tab="tier" onclick="switchRewardsTab('tier', '${user.id}')" style="padding: 12px 20px; background: none; border: none; border-bottom: 2px solid transparent; color: #6b7280; font-weight: 600; cursor: pointer;">Tier History</button>
        </div>
        <div id="rewardsTabContent">
          ${renderEZTTransactionsTable(rewards.ezt?.recentTransactions || [])}
        </div>
      </div>

      <!-- Manual Credit Section -->
      <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 12px; padding: 20px; margin-top: 20px;">
        <h3 style="margin: 0 0 12px; color: #92400e;">Manual Credit</h3>
        <p style="margin: 0 0 16px; color: #78350f; font-size: 14px;">Manually credit EZT tokens or loyalty points to this user.</p>
        <form id="manualCreditForm" onsubmit="handleManualCredit(event, '${user.id}')" style="display: flex; gap: 12px; align-items: end;">
          <div style="flex: 1;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #78350f; margin-bottom: 4px;">Type</label>
            <select id="creditType" class="input" required style="width: 100%;">
              <option value="ezt">EZT Tokens</option>
              <option value="loyalty">Loyalty Points</option>
            </select>
          </div>
          <div style="flex: 1;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #78350f; margin-bottom: 4px;">Amount</label>
            <input type="number" id="creditAmount" class="input" step="0.00001" min="0.00001" required placeholder="0.00000" style="width: 100%;">
          </div>
          <div style="flex: 2;">
            <label style="display: block; font-size: 12px; font-weight: 600; color: #78350f; margin-bottom: 4px;">Reason</label>
            <input type="text" id="creditReason" class="input" required placeholder="Reason for credit" style="width: 100%;">
          </div>
          <div>
            <button type="submit" class="btn btn-primary" style="padding: 10px 20px;">Credit</button>
          </div>
        </form>
      </div>
    </div>
  `;

  modal.classList.add('visible');
}

/**
 * Render EZT transactions table
 */
function renderEZTTransactionsTable(transactions) {
  if (transactions.length === 0) {
    return '<p style="text-align: center; color: #9ca3af; padding: 40px;">No EZT transactions yet</p>';
  }

  return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Date</th>
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Description</th>
          <th style="text-align: right; padding: 12px; font-weight: 600; color: #374151;">Amount</th>
          <th style="text-align: right; padding: 12px; font-weight: 600; color: #374151;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(tx => {
          const isEarned = tx.type === 'earned' || tx.type === 'bonus';
          const color = isEarned ? '#10b981' : '#ef4444';
          const sign = isEarned ? '+' : '-';
          const date = new Date(tx.createdAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; color: #6b7280; font-size: 14px;">${date}</td>
              <td style="padding: 12px; color: #111827;">${tx.description || 'Transaction'}</td>
              <td style="padding: 12px; text-align: right; font-weight: 600; color: ${color};">
                ${sign}${Math.abs(parseFloat(tx.amount)).toFixed(5)} EZT
              </td>
              <td style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px;">
                ${parseFloat(tx.balanceAfter).toFixed(5)}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Switch rewards tab
 */
async function switchRewardsTab(tab, userId) {
  // Update tab buttons
  document.querySelectorAll('.rewards-tab').forEach(btn => {
    btn.classList.remove('active');
    btn.style.borderBottomColor = 'transparent';
    btn.style.color = '#6b7280';
  });
  
  const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.style.borderBottomColor = '#667eea';
    activeBtn.style.color = '#667eea';
  }

  const content = document.getElementById('rewardsTabContent');
  if (!content) return;

  content.innerHTML = '<div style="text-align: center; padding: 40px;"><div class="spinner"></div> Loading...</div>';

  try {
    if (tab === 'ezt') {
      const response = await fetch(`${API_BASE}/api/v1/admin/rewards/user/${userId}`, {
        headers: getHeaders()
      });
      const result = await response.json();
      if (result.success) {
        content.innerHTML = renderEZTTransactionsTable(result.data.rewards.ezt?.recentTransactions || []);
      }
    } else if (tab === 'loyalty') {
      const response = await fetch(`${API_BASE}/api/v1/admin/rewards/user/${userId}`, {
        headers: getHeaders()
      });
      const result = await response.json();
      if (result.success) {
        content.innerHTML = renderLoyaltyTransactionsTable(result.data.rewards.loyaltyPoints?.recentTransactions || []);
      }
    } else if (tab === 'tier') {
      const response = await fetch(`${API_BASE}/api/v1/admin/rewards/user/${userId}`, {
        headers: getHeaders()
      });
      const result = await response.json();
      if (result.success) {
        content.innerHTML = renderTierHistoryTable(result.data.rewards.tier?.history || []);
      }
    }
  } catch (error) {
    console.error('Error loading tab data:', error);
    content.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 40px;">Error loading data</p>';
  }
}

/**
 * Render loyalty transactions table
 */
function renderLoyaltyTransactionsTable(transactions) {
  if (transactions.length === 0) {
    return '<p style="text-align: center; color: #9ca3af; padding: 40px;">No loyalty transactions yet</p>';
  }

  return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Date</th>
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Description</th>
          <th style="text-align: right; padding: 12px; font-weight: 600; color: #374151;">Points</th>
          <th style="text-align: right; padding: 12px; font-weight: 600; color: #374151;">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(tx => {
          const isEarned = tx.type === 'earned';
          const color = isEarned ? '#10b981' : '#ef4444';
          const points = isEarned ? tx.pointsEarned : tx.pointsSpent;
          const date = new Date(tx.createdAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; color: #6b7280; font-size: 14px;">${date}</td>
              <td style="padding: 12px; color: #111827;">${tx.description || 'Transaction'}</td>
              <td style="padding: 12px; text-align: right; font-weight: 600; color: ${color};">
                ${isEarned ? '+' : '-'}${points}
              </td>
              <td style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px;">
                ${tx.balanceAfter}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Render tier history table
 */
function renderTierHistoryTable(history) {
  if (history.length === 0) {
    return '<p style="text-align: center; color: #9ca3af; padding: 40px;">No tier upgrades yet</p>';
  }

  return `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #e5e7eb;">
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Date</th>
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Upgrade</th>
          <th style="text-align: right; padding: 12px; font-weight: 600; color: #374151;">Spend at Upgrade</th>
          <th style="text-align: left; padding: 12px; font-weight: 600; color: #374151;">Reason</th>
        </tr>
      </thead>
      <tbody>
        ${history.map(h => {
          const date = new Date(h.upgradedAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
          const isUpgrade = h.levelChange > 0;
          const arrow = isUpgrade ? '⬆️' : '⬇️';

          return `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; color: #6b7280; font-size: 14px;">${date}</td>
              <td style="padding: 12px; color: #111827; font-weight: 600;">
                ${arrow} ${h.fromTier} → ${h.toTier}
              </td>
              <td style="padding: 12px; text-align: right; color: #6b7280; font-size: 14px;">
                ₹${parseFloat(h.spendAtUpgrade || 0).toLocaleString('en-IN')}
              </td>
              <td style="padding: 12px; color: #6b7280; font-size: 14px;">${h.reason || '—'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Handle manual credit form submission
 */
async function handleManualCredit(event, userId) {
  event.preventDefault();
  
  const type = document.getElementById('creditType').value;
  const amount = document.getElementById('creditAmount').value;
  const reason = document.getElementById('creditReason').value;

  if (!amount || parseFloat(amount) <= 0) {
    showNotification('Please enter a valid amount', 'error');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/admin/rewards/manual-credit`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        type,
        amount: type === 'ezt' ? parseFloat(amount) : parseInt(amount),
        reason
      })
    });

    const result = await response.json();

    if (result.success) {
      showNotification(`Successfully credited ${amount} ${type === 'ezt' ? 'EZT' : 'loyalty points'}`, 'success');
      // Refresh rewards view
      viewUserRewards(userId);
      // Refresh user list
      if (typeof loadUsers === 'function') {
        loadUsers();
      }
    } else {
      showNotification('Failed to credit: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Error crediting rewards:', error);
    showNotification('Error crediting rewards: ' + error.message, 'error');
  }
}

// Make functions globally available
window.viewUserRewards = viewUserRewards;
window.switchRewardsTab = switchRewardsTab;
window.handleManualCredit = handleManualCredit;

