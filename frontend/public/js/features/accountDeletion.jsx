/**
 * Account Deletion Feature
 * 
 * Handles permanent account deletion in compliance with Google/Apple policies
 */

const API_BASE = typeof CONFIG !== 'undefined' && CONFIG.API_BASE_URL 
  ? CONFIG.API_BASE_URL 
  : 'http://localhost:5001';

/**
 * Check account deletion status and update UI
 */
export async function checkAccountDeletionStatus() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const response = await fetch(`${API_BASE}/api/v1/account/delete/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn('Failed to check deletion status');
      return;
    }
    
    const result = await response.json();
    const data = result.data || {};
    
    const deletionStatusCard = document.getElementById('deletionStatusCard');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn');
    
    if (data.has_pending_deletion && data.status === 'pending') {
      // Show deletion status card
      if (deletionStatusCard) deletionStatusCard.style.display = 'block';
      if (deleteAccountBtn) deleteAccountBtn.style.display = 'none';
      
      // Update deletion info
      const scheduledDate = new Date(data.scheduled_deletion_date);
      const dateElement = document.getElementById('scheduledDeletionDate');
      const daysElement = document.getElementById('daysRemaining');
      
      if (dateElement) {
        dateElement.textContent = scheduledDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      }
      
      if (daysElement) {
        daysElement.textContent = `${data.days_remaining} day${data.days_remaining !== 1 ? 's' : ''}`;
      }
    } else {
      // Hide deletion status card, show delete button
      if (deletionStatusCard) deletionStatusCard.style.display = 'none';
      if (deleteAccountBtn) deleteAccountBtn.style.display = 'block';
    }
  } catch (err) {
    console.error('Error checking deletion status:', err);
  }
}

/**
 * Request account deletion
 */
export async function requestAccountDeletion() {
  const confirmation = confirm(
    '⚠️ WARNING: DELETE ACCOUNT\n\n' +
    'Are you sure you want to delete your account?\n\n' +
    'This will:\n' +
    '• Delete all your personal information\n' +
    '• Remove all EZT tokens and transaction history\n' +
    '• Cancel all bookings and vouchers\n' +
    '• Delete loyalty points and tier status\n\n' +
    'You will have 30 days to cancel this request.\n\n' +
    'Do you want to proceed?'
  );
  
  if (!confirmation) return;
  
  // Ask for reason (optional)
  const reason = prompt(
    'Please tell us why you\'re leaving (optional):\n\n' +
    'Your feedback helps us improve.'
  );
  
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to continue');
      if (typeof navigateTo === 'function') {
        navigateTo('login');
      }
      return;
    }
    
    const response = await fetch(`${API_BASE}/api/v1/account/delete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reason: reason || null })
    });
    
    const result = await response.json();
    
    if (result.success) {
      const data = result.data || {};
      const scheduledDate = new Date(data.scheduled_deletion_date);
      
      alert(
        '✅ Account Deletion Scheduled\n\n' +
        `Your account will be permanently deleted on:\n` +
        `${scheduledDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
        `Grace Period: ${data.grace_period_days} days\n\n` +
        'You can cancel this request anytime within the grace period.\n\n' +
        'We\'re sorry to see you go. 😢'
      );
      
      // Refresh deletion status
      await checkAccountDeletionStatus();
    } else {
      alert(`Failed to schedule deletion: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Error requesting deletion:', err);
    alert(`Error: ${err.message}`);
  }
}

/**
 * Cancel account deletion
 */
export async function cancelAccountDeletion() {
  const confirmation = confirm(
    '✅ Cancel Account Deletion\n\n' +
    'Are you sure you want to cancel the deletion request?\n\n' +
    'Your account will remain active and all data will be preserved.'
  );
  
  if (!confirmation) return;
  
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to continue');
      if (typeof navigateTo === 'function') {
        navigateTo('login');
      }
      return;
    }
    
    const response = await fetch(`${API_BASE}/api/v1/account/delete/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(
        '✅ Account Deletion Cancelled\n\n' +
        'Your account will remain active.\n\n' +
        'All your data has been preserved.\n\n' +
        'Welcome back! 🎉'
      );
      
      // Refresh deletion status
      await checkAccountDeletionStatus();
    } else {
      alert(`Failed to cancel deletion: ${result.error || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Error cancelling deletion:', err);
    alert(`Error: ${err.message}`);
  }
}

// Initialize event listeners
export function initializeAccountDeletion() {
  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  const cancelDeletionBtn = document.getElementById('cancelDeletionBtn');
  
  if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', requestAccountDeletion);
  }
  
  if (cancelDeletionBtn) {
    cancelDeletionBtn.addEventListener('click', cancelAccountDeletion);
  }
  
  // Check status when profile screen is visible
  const profileScreen = document.getElementById('profileScreen');
  if (profileScreen) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          if (!profileScreen.classList.contains('hidden')) {
            checkAccountDeletionStatus();
          }
        }
      });
    });
    
    observer.observe(profileScreen, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

