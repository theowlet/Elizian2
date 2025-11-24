// ==================================
// AUTHENTICATION MODULE
// ==================================

import { CONFIG } from './config.js';

// Constants
const OTP_VERIFICATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

const TIER_ICON_MAP = {
  ather: '/assets/Aether.png',
  nova: '/assets/nova.png',
  luminar: '/assets/luminar.png',
  valiant: '/assets/valiant.png',
  echelon: '/assets/echelon.png'
};

function resolveTierIcon(tierName = '') {
  const key = tierName.toLowerCase();
  if (TIER_ICON_MAP[key]) return TIER_ICON_MAP[key];
  return '/assets/Aether.png';
}
import { apiCall } from './api.js';
import { navigateTo } from '../ui/navigation.js';
import { 
  cleanPhoneNumber, 
  validatePhoneNumber, 
  validateEmail, 
  validatePassword, 
  validateOTP,
  disableButton, 
  enableButton,
  setStorageItem,
  getStorageItem,
  removeStorageItem,
  handleError
} from '../utils/utils.js';

let currentPhone = '';
let otpSessionId = null;

// ==================================
// AUTHENTICATION FUNCTIONS
// ==================================

export async function sendOTPFromForm(phoneNumberOverride = null) {
  // If phone number is provided directly, use it; otherwise read from input
  let phone = phoneNumberOverride;
  
  if (!phone) {
    // Try to find phone input in onboarding screen first
    let phoneInput = document.getElementById('phoneInput');
    
    // If not found, try login screen
    if (!phoneInput) {
      const loginPhoneInput = document.getElementById('loginPhoneInput');
      if (loginPhoneInput) {
        phone = loginPhoneInput.value.trim();
        // Copy to main phoneInput if it exists (for consistency)
        phoneInput = document.getElementById('phoneInput');
        if (phoneInput) {
          phoneInput.value = phone;
        }
      }
    } else {
      phone = phoneInput.value.trim();
    }
    
    // If still no phone, try getting it from the active screen's input
    if (!phone) {
      const activeScreen = document.querySelector('.screen.active');
      if (activeScreen) {
        const activeInput = activeScreen.querySelector('input[type="tel"]');
        if (activeInput) {
          phone = activeInput.value.trim();
        }
      }
    }
  }
  
  console.log('[sendOTPFromForm] Phone:', phone);
  
  if (!phone || phone.length === 0) {
    alert('Please enter a phone number');
    return;
  }
  
  if (!validatePhoneNumber(phone)) {
    const cleaned = cleanPhoneNumber(phone);
    alert(`Please enter a valid 10-digit mobile number (got ${cleaned.length} digits)`);
    return;
  }

  const cleaned = cleanPhoneNumber(phone);
  currentPhone = cleaned;

  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.disabled = true;
    continueBtn.textContent = 'Sending...';
  }

  try {
    // Use CONFIG if available, otherwise fallback to localhost
    const API_BASE_URL = CONFIG?.API_BASE_URL?.replace('/api/v1', '') || "http://localhost:5001";
    const fullUrl = `${API_BASE_URL}/api/v1/auth/send-otp`;
    
    console.log('Sending OTP request to:', fullUrl);
    console.log('Phone number:', cleaned);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    let res;
    try {
      res = await fetch(fullUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ phone_number: cleaned }),
        signal: controller.signal
      });
    } catch (fetchError) {
      // Network error (CORS, connection refused, etc.)
      console.error('Fetch error:', fetchError);
      throw new Error(`Network error: ${fetchError.message}. Please check if the backend server is running on ${API_BASE_URL}`);
    }

    clearTimeout(timeoutId);
    
    console.log('Response status:', res.status);
    console.log('Response headers:', res.headers);
    
    if (!res.ok) {
      // Try to get error message from response
      let errorText = '';
      try {
        const errorData = await res.json();
        errorText = errorData.error || errorData.message || `Server returned ${res.status}: ${res.statusText}`;
      } catch {
        errorText = await res.text() || `Server returned ${res.status}: ${res.statusText}`;
      }
      throw new Error(errorText);
    }

    let data;
    try {
      data = await res.json();
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', parseError);
      throw new Error('Invalid response from server. Please check backend logs.');
    }
    
    console.log("OTP Response:", data);

    if (!data.success) {
      throw new Error(data.error || data.message || "Failed to send OTP");
    }

    alert(`OTP sent successfully to ${cleaned}`);
    navigateTo('otp');
    
    // Focus on first OTP input
    setTimeout(() => {
      const firstOtpInput = document.querySelector('.otp-input');
      if (firstOtpInput) firstOtpInput.focus();
    }, 100);
  } catch (error) {
    console.error('Send OTP Error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    let errorMessage = 'Failed to send OTP. ';
    if (error.name === 'AbortError') {
      errorMessage += 'Request timed out. Please check if the backend server is running.';
    } else if (error.message.includes('Network error') || error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
      errorMessage += error.message.includes('Network error') ? error.message : 
        'Cannot connect to server. Please ensure:\n1. Backend is running: npm start (in backend folder)\n2. Backend is on port 5001\n3. No firewall blocking the connection\n4. CORS is properly configured';
    } else {
      errorMessage += error.message;
    }
    
    alert(errorMessage);
  } finally {
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue';
    }
  }
}

// Attach sendOTPFromForm globally for immediate availability
window.sendOTPFromForm = sendOTPFromForm;

export async function verifyOTPFromForm() {
  const digits = document.querySelectorAll('.otp-input');
  const otp = Array.from(digits).map(d => d.value).join('');

  if (!validateOTP(otp)) {
    alert('Please enter all 6 digits');
    return;
  }

  disableButton('verifyOtpBtn');

  try {
    // Step 1: Verify OTP
    const verifyData = await apiCall('/auth/verify-otp', 'POST', { 
      phone_number: currentPhone,
      otp_code: otp 
    });

    if (!verifyData.success) {
      throw new Error(verifyData.error || 'Invalid OTP');
    }

    // Extract data from response (backend wraps in { success, message, data })
    const data = verifyData.data || verifyData;

    // Step 2: Check if user exists or needs registration
    if (data.token) {
      // Existing user - login successful
      // Store token as plain string (not JSON stringified)
      localStorage.setItem('token', data.token);
      setStorageItem('userInfo', data.user);
      
      alert(`Welcome back, ${data.user.first_name}!`);
      navigateTo('home');
    } else if (data.requiresRegistration) {
      // New user - needs registration
      // Store phone temporarily in sessionStorage (not localStorage)
      sessionStorage.setItem('tempRegistrationPhone', currentPhone);
      
      alert('OTP verified! Please complete your registration');
      navigateTo('signup');
    } else {
      console.error('Unexpected response structure:', verifyData);
      throw new Error('Unexpected response from server');
    }
  } catch (error) {
    console.error('Verify OTP Error:', error);
    alert('Verification Failed: ' + error.message);
  } finally {
    enableButton('verifyOtpBtn');
  }
}

export async function registerNewUser() {
  const phone = document.getElementById('regPhoneInput').value.trim();
  const email = document.getElementById('regEmailInput').value.trim();
  const firstName = document.getElementById('regFirstNameInput').value.trim();
  const lastName = document.getElementById('regLastNameInput').value.trim();
  const password = document.getElementById('regPasswordInput').value;
  const otp = document.getElementById('regOtpInput').value.trim();

  if (!phone || !email || !firstName || !lastName || !password || !otp) {
    alert('Please fill in all fields');
    return;
  }

  if (!validatePassword(password)) {
    alert('Password must be at least 6 characters');
    return;
  }

  if (!validateEmail(email)) {
    alert('Please enter a valid email address');
    return;
  }

  // Get phone from sessionStorage (backend handles OTP verification)
  const tempPhone = sessionStorage.getItem('tempRegistrationPhone');
  if (!tempPhone || tempPhone !== phone) {
    alert('Please verify your phone number first');
    navigateTo('login');
    return;
  }
  
  // Clear after use
  sessionStorage.removeItem('tempRegistrationPhone');

  disableButton('registerBtn');

  try {
    // Backend verifies OTP from the verified session, no need to send otp_code
    const data = await apiCall('/auth/register', 'POST', {
      phone_number: cleanPhoneNumber(phone),
      email,
      first_name: firstName,
      last_name: lastName,
      password
    });

    if (data.success) {
      // Store user info and token
      // Store token as plain string (not JSON stringified)
      localStorage.setItem('token', data.data?.token || data.token);
      setStorageItem('userInfo', data.data?.user || data.user);
      
      alert(`Welcome to Elizian, ${firstName}!`);
      navigateTo('home');
    } else {
      throw new Error(data.error || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration Error:', error);
    alert('Registration Failed: ' + error.message);
  } finally {
    enableButton('registerBtn');
  }
}

export async function loginWithEmail() {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  if (!validateEmail(email)) {
    alert('Please enter a valid email address');
    return;
  }

  try {
    const data = await apiCall('/auth/login', 'POST', { email, password });

    if (data.success) {
      setStorageItem('token', data.token);
      setStorageItem('userInfo', data.user);
      
      alert(`Welcome back, ${data.user.first_name}!`);
      navigateTo('home');
    } else {
      throw new Error(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login Error:', error);
    alert('Login Failed: ' + error.message);
  }
}

export function resendOTP() {
  document.querySelectorAll('.otp-input').forEach(d => d.value = '');
  navigateTo('login');
  alert('Please click "Send OTP" again');
}

export function logout() {
  removeStorageItem('token');
  removeStorageItem('userInfo');
  removeStorageItem('verifiedOTP');
  navigateTo('login');
}

// ==================================
// OTP INPUT HANDLING
// ==================================
export function handleOTPInput(currentIndex) {
  const otpInputs = document.querySelectorAll('.otp-input');
  const currentInput = otpInputs[currentIndex];
  
  if (currentInput.value.length === 1) {
    // Move to next input
    if (currentIndex < otpInputs.length - 1) {
      otpInputs[currentIndex + 1].focus();
    }
  }
}

export function handleOTPKeydown(currentIndex, event) {
  const otpInputs = document.querySelectorAll('.otp-input');
  const currentInput = otpInputs[currentIndex];
  
  // Handle backspace
  if (event.key === 'Backspace' && currentInput.value === '') {
    if (currentIndex > 0) {
      otpInputs[currentIndex - 1].focus();
    }
  }
  
  // Handle paste
  if (event.key === 'v' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    navigator.clipboard.readText().then(text => {
      const otpCode = text.replace(/\D/g, '').slice(0, 6);
      otpInputs.forEach((input, index) => {
        input.value = otpCode[index] || '';
      });
      otpInputs[Math.min(otpCode.length, otpInputs.length - 1)].focus();
    });
  }
}

// ==================================
// PROFILE FUNCTIONS
// ==================================
export function updateWelcomeText() {
  const userInfo = getStorageItem('userInfo', {});
  const welcomeText = document.getElementById('welcomeText');
  if (welcomeText) {
    welcomeText.textContent = `Welcome, ${userInfo.first_name || 'Guest'}!`;
  }
}

export async function updateProfileInfo() {
  const userInfo = getStorageItem('userInfo', {});
  const profileInfo = document.getElementById('profileInfo');
  const tierInfo = document.getElementById('tierInfo');
  
  // Update basic profile info
  if (profileInfo) {
    profileInfo.innerHTML = `
      <p><strong>Name:</strong> ${userInfo.first_name || ''} ${userInfo.last_name || ''}</p>
      <p><strong>Email:</strong> ${userInfo.email || ''}</p>
      <p><strong>Phone:</strong> ${userInfo.phone_number || ''}</p>
    `;
  }
  
  // Fetch full profile data including EZT balance and tier info
  try {
    const token = getAuthToken();
    if (!token) {
      console.warn('No auth token, skipping profile data fetch');
      return;
    }
    
    const apiBase = CONFIG.API_BASE_URL || "http://localhost:5001/api/v1";
    const response = await fetch(`${apiBase}/user/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data) {
        const profileData = data.data;
        
        // Update EZT balance display
        const eztBalanceAmount = document.getElementById('eztBalanceAmount');
        const eztTotalEarned = document.getElementById('eztTotalEarned');
        const eztTotalSpent = document.getElementById('eztTotalSpent');
        
        if (eztBalanceAmount) {
          eztBalanceAmount.textContent = `${parseFloat(profileData.ezt_balance || 0).toFixed(5)} EZT`;
        }
        if (eztTotalEarned) {
          eztTotalEarned.textContent = `Total Earned: ${parseFloat(profileData.ezt_total_earned || 0).toFixed(5)} EZT`;
        }
        if (eztTotalSpent) {
          eztTotalSpent.textContent = `Total Spent: ${parseFloat(profileData.ezt_total_spent || 0).toFixed(5)} EZT`;
        }
        
        // Update tier information
        const nextTierSpend = document.getElementById('nextTierSpend');
        const nextTierName = document.getElementById('nextTierName');
        const tierInfo = document.getElementById('tierInfo');
        
        const normalizedTier = (profileData.current_tier || 'Ather').trim();
        const tierPctVal = parseFloat(profileData.tier_percentage ?? CONFIG.TIER_PERCENTAGES[normalizedTier] ?? CONFIG.TIER_PERCENTAGES.Ather ?? 1);
        const tierPctLabel = `${tierPctVal.toFixed(2)}%`;
        const iconUrl = resolveTierIcon(normalizedTier);
        
        if (tierInfo) {
          tierInfo.innerHTML = `
            <div class="tier-highlight tier-${normalizedTier.toLowerCase()}">
              <div class="tier-highlight-left">
                <div class="tier-icon">
                  <img id="tierIconImg" src="${iconUrl}" alt="${normalizedTier} tier icon" onerror="this.src='${resolveTierIcon('ather')}'; this.onerror=null;">
                </div>
                <div class="tier-text">
                  <div class="tier-label">Current Tier</div>
                  <div id="currentTierName" class="tier-name">${normalizedTier}</div>
                  <div class="tier-earn-rate">
                    <span>Earning Rate</span>
                    <strong><span id="currentTierPercentage">${tierPctLabel}</span> EZ Tokens</strong>
                  </div>
                </div>
              </div>
              <div class="tier-badge tier-${normalizedTier.toLowerCase()}">EZT Loyalty</div>
            </div>
          `;
        }
        
        if (profileData.next_tier) {
          if (nextTierSpend) {
            nextTierSpend.textContent = `₹${profileData.next_tier.spend_needed.toLocaleString()}`;
          }
          if (nextTierName) {
            nextTierName.textContent = profileData.next_tier.name;
          }
        } else {
          if (nextTierSpend) {
            nextTierSpend.textContent = '—';
          }
          if (nextTierName) {
            nextTierName.textContent = 'Maximum tier reached';
          }
        }
        
        // Tier card already re-rendered above
      }
    } else {
      console.error('Failed to fetch profile data:', response.status);
    }
  } catch (error) {
    console.error('Error fetching profile data:', error);
    // Fallback to basic tier display
    if (tierInfo) {
      const fallbackTier = (userInfo.current_tier || 'Ather').trim();
      const fallbackPct = CONFIG.TIER_PERCENTAGES[fallbackTier] || CONFIG.TIER_PERCENTAGES.Ather || 1;
      tierInfo.innerHTML = `
        <div class="tier-highlight tier-${fallbackTier.toLowerCase()}">
          <div class="tier-highlight-left">
            <div class="tier-icon">
              <img id="tierIconImg" src="${resolveTierIcon(fallbackTier)}" alt="${fallbackTier} tier icon" onerror="this.src='${resolveTierIcon('ather')}'; this.onerror=null;">
            </div>
            <div class="tier-text">
              <div class="tier-label">Current Tier</div>
              <div id="currentTierName" class="tier-name">${fallbackTier}</div>
              <div class="tier-earn-rate">
                <span>Earning Rate</span>
                <strong><span id="currentTierPercentage">${fallbackPct.toFixed(2)}%</span> EZ Tokens</strong>
              </div>
            </div>
          </div>
          <div class="tier-badge tier-${fallbackTier.toLowerCase()}">EZT Loyalty</div>
        </div>
      `;
    }
  }
}

// ==================================
// AUTHENTICATION STATE
// ==================================
export function isAuthenticated() {
  return !!getStorageItem('token');
}

export function getCurrentUser() {
  return getStorageItem('userInfo', {});
}

export function getAuthToken() {
  return getStorageItem('token');
}

// ==================================
// TOKEN VALIDATION
// ==================================

/**
 * Check if JWT token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} True if token is expired or invalid
 */
export function isTokenExpired(token) {
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch (error) {
    console.error('[auth] Token validation error:', error);
    return true;
  }
}

/**
 * Validate authentication token before API calls
 * @returns {boolean} True if token is valid
 */
export function validateAuthToken() {
  const token = getAuthToken();
  
  if (!token || isTokenExpired(token)) {
    // Check if already on login screen to prevent navigation loops
    const loginScreen = document.getElementById('loginScreen');
    const isOnLoginScreen = loginScreen && loginScreen.classList.contains('active');
    
    if (!isOnLoginScreen) {
      alert('Session expired. Please login again.');
      clearAuth();
      navigateTo('login');
    }
    return false;
  }
  
  return true;
}

// ==================================
// EXPORTS FOR GLOBAL ACCESS
// ==================================
window.sendOTPFromForm = sendOTPFromForm;
window.verifyOTPFromForm = verifyOTPFromForm;
window.registerNewUser = registerNewUser;
window.loginWithEmail = loginWithEmail;
window.resendOTP = resendOTP;
window.logout = logout;
window.handleOTPInput = handleOTPInput;
window.handleOTPKeydown = handleOTPKeydown;
window.updateWelcomeText = updateWelcomeText;
window.updateProfileInfo = updateProfileInfo;
window.isAuthenticated = isAuthenticated;
window.getCurrentUser = getCurrentUser;
window.getAuthToken = getAuthToken;
window.isTokenExpired = isTokenExpired;
window.validateAuthToken = validateAuthToken;