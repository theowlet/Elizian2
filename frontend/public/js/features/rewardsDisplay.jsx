/**
 * Rewards Display Module
 * Handles loading and displaying rewards data (EZT, loyalty points, tier history)
 */

const API_BASE = window.CONFIG?.API_BASE_URL?.replace('/api/v1', '') || 'http://localhost:3000';

/**
 * Load and display complete rewards summary
 */
export async function loadRewardsSummary() {
  try {
    const token = localStorage.getItem('userToken') || localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token for rewards summary');
      return null;
    }

    const response = await fetch(`${API_BASE}/api/v1/rewards/summary`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load rewards: ${response.status}`);
    }

    const result = await response.json();
    if (result.success && result.data) {
      renderRewardsSummary(result.data);
      return result.data;
    }
    return null;
  } catch (error) {
    console.error('Error loading rewards summary:', error);
    return null;
  }
}

/**
 * Render complete rewards summary
 */
function renderRewardsSummary(data) {
  // Update EZT balance (if not already updated by updateProfileInfo)
  const eztBalanceAmount = document.getElementById('eztBalanceAmount');
  if (eztBalanceAmount && data.ezt) {
    eztBalanceAmount.textContent = `${parseFloat(data.ezt.balance || 0).toFixed(5)} EZT`;
  }

  // Render EZT transactions
  if (data.ezt?.recentTransactions) {
    renderEZTTransactions(data.ezt.recentTransactions);
  }

  // Render loyalty points
  if (data.loyaltyPoints) {
    renderLoyaltyPoints(data.loyaltyPoints);
  }

  // Render tier history
  if (data.tier?.history) {
    renderTierHistory(data.tier.history);
  }
}

/**
 * Render EZT transaction history
 */
function renderEZTTransactions(transactions) {
  const container = document.getElementById('eztTransactionsContainer');
  if (!container) {
    // Create container if it doesn't exist
    const eztBalanceCard = document.getElementById('eztBalance')?.closest('.card') || document.getElementById('eztBalance')?.parentElement;
    if (eztBalanceCard) {
      const newContainer = document.createElement('div');
      newContainer.id = 'eztTransactionsContainer';
      newContainer.className = 'rewards-transactions-container';
      newContainer.style.cssText = 'margin-top: 16px; max-height: 400px; overflow-y: auto;';
      eztBalanceCard.appendChild(newContainer);
      renderEZTTransactions(transactions);
      return;
    }
    return;
  }

  if (transactions.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No EZT transactions yet</p>';
    return;
  }

  container.innerHTML = transactions.map(tx => {
    const isEarned = tx.type === 'earned' || tx.type === 'bonus';
    const icon = isEarned ? '✅' : '💸';
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
      <div class="transaction-item" style="
        padding: 12px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background 0.2s;
      " onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='transparent'">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #111827; display: flex; align-items: center; gap: 8px;">
            <span>${icon}</span>
            <span>${tx.description || 'Transaction'}</span>
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
            ${date}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; font-size: 16px; color: ${color};">
            ${sign}${Math.abs(parseFloat(tx.amount)).toFixed(5)} EZT
          </div>
          <div style="font-size: 12px; color: #6b7280;">
            Balance: ${parseFloat(tx.balanceAfter).toFixed(5)}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add "View All" button
  const viewAllBtn = document.createElement('button');
  viewAllBtn.textContent = 'View All Transactions';
  viewAllBtn.className = 'btn btn-secondary';
  viewAllBtn.style.cssText = 'width: 100%; margin-top: 12px; padding: 10px;';
  viewAllBtn.onclick = () => loadEZTTransactionsPage();
  container.appendChild(viewAllBtn);
}

/**
 * Render loyalty points display
 */
function renderLoyaltyPoints(loyaltyData) {
  let container = document.getElementById('loyaltyPointsContainer');
  if (!container) {
    // Create container
    const profileScreen = document.getElementById('profileScreen');
    if (profileScreen) {
      container = document.createElement('div');
      container.id = 'loyaltyPointsContainer';
      container.className = 'loyalty-points-card';
      container.style.cssText = 'padding: 16px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px; color: white; margin-bottom: 16px;';
      profileScreen.querySelector('.screen-content')?.appendChild(container);
      renderLoyaltyPoints(loyaltyData);
      return;
    }
    return;
  }

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Available Points</div>
        <div style="font-size: 32px; font-weight: bold;">${parseInt(loyaltyData.balance || 0).toLocaleString('en-IN')}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 12px; opacity: 0.8;">Total Earned</div>
        <div style="font-size: 18px; font-weight: 600;">${parseInt(loyaltyData.totalEarned || 0).toLocaleString('en-IN')}</div>
      </div>
    </div>
    <div style="font-size: 12px; opacity: 0.8; margin-top: 8px;">
      Total Redeemed: ${parseInt(loyaltyData.totalRedeemed || 0).toLocaleString('en-IN')}
    </div>
  `;

  // Add transaction history
  if (loyaltyData.recentTransactions && loyaltyData.recentTransactions.length > 0) {
    const historyContainer = document.createElement('div');
    historyContainer.id = 'loyaltyTransactionsContainer';
    historyContainer.style.cssText = 'margin-top: 16px; max-height: 300px; overflow-y: auto; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px;';
    
    historyContainer.innerHTML = loyaltyData.recentTransactions.map(tx => {
      const isEarned = tx.type === 'earned';
      const icon = isEarned ? '✅' : '💸';
      const points = isEarned ? tx.pointsEarned : tx.pointsSpent;
      const date = new Date(tx.createdAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between;">
          <div>
            <div style="font-weight: 600;">${icon} ${tx.description || 'Transaction'}</div>
            <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">${date}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700;">${isEarned ? '+' : '-'}${points}</div>
            <div style="font-size: 11px; opacity: 0.8;">Balance: ${tx.balanceAfter}</div>
          </div>
        </div>
      `;
    }).join('');

    container.appendChild(historyContainer);
  }
}

/**
 * Render tier history
 */
function renderTierHistory(history) {
  let container = document.getElementById('tierHistoryContainer');
  if (!container) {
    const profileScreen = document.getElementById('profileScreen');
    if (profileScreen) {
      container = document.createElement('div');
      container.id = 'tierHistoryContainer';
      container.className = 'tier-history-card';
      container.style.cssText = 'padding: 16px; background: #f9fafb; border-radius: 12px; margin-bottom: 16px;';
      profileScreen.querySelector('.screen-content')?.appendChild(container);
      renderTierHistory(history);
      return;
    }
    return;
  }

  if (history.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 20px;">No tier upgrades yet</p>';
    return;
  }

  container.innerHTML = `
    <h3 style="margin-bottom: 12px; color: #111827; font-size: 18px;">🎯 Tier Upgrade History</h3>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${history.map(h => {
        const date = new Date(h.upgradedAt).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        const isUpgrade = h.levelChange > 0;
        const arrow = isUpgrade ? '⬆️' : '⬇️';

        return `
          <div style="padding: 12px; background: white; border-radius: 8px; border-left: 4px solid ${isUpgrade ? '#10b981' : '#ef4444'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: #111827;">
                  ${arrow} ${h.fromTier} → ${h.toTier}
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                  ${date} • ₹${parseFloat(h.spendAtUpgrade || 0).toLocaleString('en-IN')} spent
                </div>
                ${h.reason ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">${h.reason}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

/**
 * Load EZT transactions with pagination
 */
export async function loadEZTTransactionsPage(page = 1) {
  try {
    const token = localStorage.getItem('userToken') || localStorage.getItem('token');
    if (!token) return;

    const response = await fetch(`${API_BASE}/api/v1/rewards/ezt/transactions?page=${page}&limit=20`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        // Show in modal or expand view
        showTransactionsModal('EZT Transactions', result.data.transactions, result.data.pagination);
      }
    }
  } catch (error) {
    console.error('Error loading EZT transactions:', error);
  }
}

/**
 * Show transactions in modal
 */
function showTransactionsModal(title, transactions, pagination) {
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
  
  modal.innerHTML = `
    <div style="background: white; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; padding: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: #111827;">${title}</h2>
        <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
      </div>
      <div id="transactionsList">
        ${transactions.map(tx => {
          const isEarned = tx.type === 'earned' || tx.type === 'bonus';
          const icon = isEarned ? '✅' : '💸';
          const color = isEarned ? '#10b981' : '#ef4444';
          const sign = isEarned ? '+' : '-';
          const date = new Date(tx.createdAt).toLocaleString('en-IN');

          return `
            <div style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
              <div style="display: flex; justify-content: space-between;">
                <div>
                  <div style="font-weight: 600;">${icon} ${tx.description || 'Transaction'}</div>
                  <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${date}</div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; color: ${color};">
                    ${sign}${Math.abs(parseFloat(tx.amount)).toFixed(5)} EZT
                  </div>
                  <div style="font-size: 12px; color: #6b7280;">Balance: ${parseFloat(tx.balanceAfter).toFixed(5)}</div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${pagination && pagination.pages > 1 ? `
        <div style="display: flex; justify-content: center; gap: 8px; margin-top: 20px;">
          ${Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => `
            <button onclick="loadEZTTransactionsPage(${p})" 
                    style="padding: 8px 12px; border: 1px solid #d1d5db; background: ${p === pagination.page ? '#667eea' : 'white'}; 
                           color: ${p === pagination.page ? 'white' : '#111827'}; border-radius: 6px; cursor: pointer;">
              ${p}
            </button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  document.body.appendChild(modal);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// Make functions globally available
window.loadRewardsSummary = loadRewardsSummary;
window.loadEZTTransactionsPage = loadEZTTransactionsPage;

