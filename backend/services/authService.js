const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/response');
const { log, logError } = require('../utils/logger');
const { generateOTP } = require('../utils/otp');
const { getPool } = require('../src/config/db');
const { grantSignupBonus } = require('./loyaltyService');
const { sendPasswordRecoveryEmail } = require('../emailService');

const pool = getPool();

// Constants
const OTP_VERIFICATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const PASSWORD_MIN_LENGTH = 8;

async function sendOtp({ phoneNumber, countryCode = '+91', purpose = 'login', logToFile = true }) {
  if (!phoneNumber) {
    throw new AppError(400, 'Phone number required');
  }

  const otp = generateOTP();
  const hashedOtp = await bcrypt.hash(otp, 5);
  const expiresAt = new Date(Date.now() + OTP_VERIFICATION_TIMEOUT);

  await pool.query(
    `DELETE FROM otp_sessions WHERE phone_number = $1 AND verified = false`,
    [phoneNumber]
  );

  await pool.query(
    `INSERT INTO otp_sessions (phone_number, country_code, otp_hash, purpose, expires_at, verified, attempts)
     VALUES ($1, $2, $3, $4, $5, false, 0)`,
    [phoneNumber, countryCode, hashedOtp, purpose || 'login', expiresAt]
  );

  if (process.env.NODE_ENV === 'development' && process.env.LOG_OTP !== 'false') {
    log(`[DEV] OTP for ${countryCode}${phoneNumber}: ${otp}`);
  }

  if (process.env.NODE_ENV === 'development' || process.env.LOG_OTP === 'true') {
    const otpLogMessage = `🔐 OTP for ${phoneNumber}: ${otp} (expires in 10 minutes) - ${new Date().toISOString()}\n`;
    log(otpLogMessage.trim());

    if (!process.env.VERCEL && logToFile) {
      const logPath = path.join(__dirname, '..', 'otp.log');
      fs.appendFileSync(logPath, otpLogMessage);
    }
  }

  return { expires_in: '10 minutes' };
}

async function verifyOtp({ phoneNumber, otpCode }) {
  if (!phoneNumber || !otpCode) {
    throw new AppError(400, 'Phone number and OTP required');
  }

  // Use transaction with row locks to prevent race conditions
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the otp_session row
    const result = await client.query(
      `SELECT id, otp_hash, expires_at, verified, attempts
       FROM otp_sessions
       WHERE phone_number = $1
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [phoneNumber]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'No OTP found for this number');
    }

    const otpSession = result.rows[0];

    if (otpSession.verified) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'OTP already verified');
    }

    if (new Date(otpSession.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'OTP expired');
    }

    if (otpSession.attempts >= 5) {
      await client.query('ROLLBACK');
      throw new AppError(403, 'Maximum attempts exceeded');
    }

    const otpMatch = await bcrypt.compare(String(otpCode), otpSession.otp_hash);
    if (!otpMatch) {
      await client.query(
        `UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1`,
        [otpSession.id]
      );
      await client.query('COMMIT');
      throw new AppError(400, 'Invalid OTP');
    }

    // Mark verified
    await client.query(
      `UPDATE otp_sessions
       SET verified = true, verified_at = NOW()
       WHERE id = $1`,
      [otpSession.id]
    );

    // Check for existing user (locked)
    const existingUser = await client.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.current_tier_id
       FROM users u
       WHERE u.phone_number = $1
       FOR UPDATE`,
      [phoneNumber]
    );

    await client.query('COMMIT');

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      const token = jwt.sign(
        {
          userId: user.id,
          phone: user.phone_number,
          type: 'user'
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        token,
        user,
        requiresRegistration: false
      };
    }

    return {
      requiresRegistration: true
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function formatName({ firstName, lastName, name }) {
  let formattedFirst = (firstName || '').trim();
  let formattedLast = (lastName || '').trim();

  if (!formattedFirst && name) {
    const nameParts = (name || '').trim().split(/\s+/);
    formattedFirst = nameParts[0] || '';
    formattedLast = nameParts.slice(1).join(' ') || '';
  }

  if (!formattedFirst) {
    throw new AppError(400, "First name is required. Provide either 'first_name' or 'name' field.");
  }

  return { firstName: formattedFirst, lastName: formattedLast };
}

function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new AppError(400, 'Phone number is required for user registration.');
  }
  let clean = String(phoneNumber).replace(/\D/g, '');
  if (clean.startsWith('91') && clean.length === 12) {
    clean = clean.substring(2);
  }
  if (clean.length !== 10 || !/^\d{10}$/.test(clean)) {
    throw new AppError(400, 'Invalid phone number format. Must be exactly 10 digits.');
  }
  return clean;
}

async function ensureRole(dbRoleName) {
  const roleResult = await pool.query(
    'SELECT id FROM roles WHERE role_name = $1 LIMIT 1',
    [dbRoleName]
  );
  const roleId = roleResult.rows[0]?.id;
  if (!roleId) {
    throw new AppError(500, `Role '${dbRoleName}' not found. Please initialize database tables.`);
  }
  return roleId;
}

async function getDefaultTier() {
  const tierRes = await pool.query(
    "SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1"
  );
  const tierId = tierRes.rows[0]?.id || null;
  if (!tierId) {
    throw new AppError(500, 'Default tier not found. Please run the seed script.');
  }
  return tierId;
}

async function registerSuperAdmin({ phoneNumber, email, password, firstName, lastName }) {
  if (!email || !password) {
    throw new AppError(400, 'Super Admin requires email and password.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'Invalid email format.');
  }

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, 'Password must be at least 8 characters long');
  }

  let existingSuperAdmin = { rows: [] };
  try {
    existingSuperAdmin = await pool.query(
      `SELECT u.id FROM users u 
           JOIN roles r ON u.role_id = r.id 
           WHERE r.role_name IN ('super_admin', 'admin', 'super-admin') LIMIT 1`
    );
  } catch (roleCheckError) {
    const errorMsg = roleCheckError.message || '';
    const isRoleIdError = roleCheckError.code === '42703' ||
      errorMsg.toLowerCase().includes('role_id') ||
      errorMsg.toLowerCase().includes('does not exist');
    if (!isRoleIdError) {
      throw roleCheckError;
    }
  }

  if (existingSuperAdmin.rows.length > 0) {
    throw new AppError(409, 'Super Admin already exists. Please log in instead.');
  }

  const existingEmail = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  if (existingEmail.rows.length > 0) {
    throw new AppError(409, 'Email already registered.');
  }

  let roleId = null;
  try {
    const roleResult = await pool.query(
      "SELECT id FROM roles WHERE role_name = 'super_admin' LIMIT 1"
    );
    roleId = roleResult.rows[0]?.id;
    if (!roleId) {
      const createRoleResult = await pool.query(
        `INSERT INTO roles (role_name, description) 
             VALUES ('super_admin', 'Super Administrator with full system access')
             RETURNING id`
      );
      roleId = createRoleResult.rows[0].id;
    }
  } catch (roleError) {
    const errorMsg = roleError.message || '';
    const isRoleIdError = roleError.code === '42703' ||
      errorMsg.toLowerCase().includes('role_id') ||
      errorMsg.toLowerCase().includes('does not exist');
    if (!isRoleIdError) {
      throw roleError;
    }
  }

  let tierResult = await pool.query("SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1");
  let tierId = tierResult.rows[0]?.id;

  if (!tierId) {
    const createTierResult = await pool.query(
      `INSERT INTO tiers (name, level, token_earning_percentage, min_spend_required, description, color_code) 
         VALUES ('Ather', 1, 1.00, 0, 'Default membership tier', '#B0BEC5')
         RETURNING id`
    );
    tierId = createTierResult.rows[0].id;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let userInsert;
  try {
    if (roleId) {
      userInsert = await pool.query(
        `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id, role_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, email, first_name, last_name, phone_number`,
        [phoneNumber || null, email, firstName, lastName, tierId, roleId]
      );
    } else {
      throw new Error('roleId is null, try without role_id');
    }
  } catch (insertError) {
    const errorMsg = insertError.message || '';
    const isRoleIdError = insertError.code === '42703' ||
      errorMsg.toLowerCase().includes('role_id') ||
      errorMsg.toLowerCase().includes('does not exist');
    if (isRoleIdError) {
      userInsert = await pool.query(
        `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, email, first_name, last_name, phone_number`,
        [phoneNumber || null, email, firstName, lastName, tierId]
      );
    } else {
      throw insertError;
    }
  }

  const userId = userInsert.rows[0].id;

  await pool.query(
    `INSERT INTO tier_progress (user_id, current_tier_id, total_spend)
         VALUES ($1, $2, 0)
         ON CONFLICT (user_id) DO NOTHING`,
    [userId, tierId]
  );

  await pool.query(
    `INSERT INTO user_auth_credentials (user_id, password_hash, email_verified)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = $2, email_verified = true`,
    [userId, passwordHash]
  );

  await grantSignupBonus(userId);

  const token = jwt.sign(
    {
      userId,
      phone: phoneNumber || null,
      email,
      role: 'super_admin',
      type: 'user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    user: {
      id: userId,
      phone_number: phoneNumber || null,
      email,
      first_name: firstName,
      last_name: lastName,
      role: 'super_admin',
      current_tier_id: tierId
    }
  };
}

async function registerUser(payload) {
  const { role = 'user', email, password } = payload;
  const { firstName, lastName } = formatName(payload);

  if (role === 'super_admin') {
    return registerSuperAdmin({
      phoneNumber: payload.phone_number,
      email,
      password,
      firstName,
      lastName
    });
  }

  const cleanPhone = sanitizePhoneNumber(payload.phone_number);

  const otpCheck = await pool.query(
    `SELECT id, verified, expires_at, created_at 
       FROM otp_sessions
       WHERE phone_number = $1 AND verified = true 
       ORDER BY verified_at DESC
       LIMIT 1`,
    [cleanPhone]
  );

  if (otpCheck.rows.length === 0 || !otpCheck.rows[0].verified) {
    throw new AppError(403, 'OTP verification required before registration. Please verify your phone number first.');
  }

  const verifiedAt = new Date(otpCheck.rows[0].verified_at || otpCheck.rows[0].created_at);
  const verificationAge = Date.now() - verifiedAt.getTime();
  if (verificationAge > OTP_VERIFICATION_TIMEOUT) {
    throw new AppError(403, 'OTP verification expired. Please verify again.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'Invalid email format.');
  }

  if (password && password.length > 0 && password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, 'Password must be at least 8 characters long');
  }

  const existingUserByPhone = await pool.query(
    'SELECT id FROM users WHERE phone_number = $1',
    [cleanPhone]
  );
  if (existingUserByPhone.rows.length > 0) {
    throw new AppError(409, 'User with this phone number already exists. Please log in instead.');
  }

  if (email) {
    const existingUserByEmail = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingUserByEmail.rows.length > 0) {
      throw new AppError(409, 'User with this email already exists.');
    }
  }

  let dbRoleName = 'user';
  if (role === 'partner') {
    dbRoleName = 'partner_admin';
  }

  const roleId = await ensureRole(dbRoleName);
  const tierId = await getDefaultTier();

  const passwordHash = password && password.length > 0 ? await bcrypt.hash(password, 10) : null;

  const userInsert = await pool.query(
    `INSERT INTO users (phone_number, email, first_name, last_name, current_tier_id, role_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, phone_number`,
    [cleanPhone, email || null, firstName, lastName, tierId, roleId]
  );

  const userId = userInsert.rows[0].id;

  await pool.query(
    `INSERT INTO tier_progress (user_id, current_tier_id, total_spend)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO NOTHING`,
    [userId, tierId]
  );

  if (passwordHash) {
    await pool.query(
      `INSERT INTO user_auth_credentials (user_id, password_hash, email_verified)
         VALUES ($1, $2, false)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = $2`,
      [userId, passwordHash]
    );
  }

  await pool.query(
    `UPDATE otp_sessions SET verified = true WHERE phone_number = $1 AND id = $2`,
    [cleanPhone, otpCheck.rows[0].id]
  );

  await grantSignupBonus(userId);

  const token = jwt.sign(
    {
      userId,
      phone: cleanPhone,
      email: email || null,
      role: dbRoleName,
      type: 'user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    user: {
      id: userId,
      phone_number: cleanPhone,
      email: email || null,
      first_name: firstName,
      last_name: lastName,
      role: dbRoleName,
      current_tier_id: tierId
    }
  };
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new AppError(400, 'Email and password required');
  }

  // Normalize email (lowercase, trim)
  const normalizedEmail = email.toLowerCase().trim();

  let userRes;
  try {
    userRes = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.role_id, r.role_name, c.password_hash
         FROM users u
         JOIN user_auth_credentials c ON u.id = c.user_id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE LOWER(u.email) = $1`,
      [normalizedEmail]
    );
  } catch (roleError) {
    const errorMsg = roleError.message || '';
    const isRoleIdError = roleError.code === '42703' ||
      errorMsg.toLowerCase().includes('role_id') ||
      errorMsg.toLowerCase().includes('does not exist');

    if (isRoleIdError) {
      userRes = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, c.password_hash
           FROM users u
           JOIN user_auth_credentials c ON u.id = c.user_id
           WHERE LOWER(u.email) = $1`,
        [normalizedEmail]
      );
      if (userRes.rows.length > 0) {
        userRes.rows[0].role_name = 'user';
      }
    } else {
      throw roleError;
    }
  }

  if (userRes.rows.length === 0) {
    logError(`[User Login] User not found for email: ${normalizedEmail}`);
    throw new AppError(400, 'Invalid credentials');
  }

  const user = userRes.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    logError(`[User Login] Invalid password for user: ${user.id} (${normalizedEmail})`);
    throw new AppError(400, 'Invalid credentials');
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role_name || 'user',
      type: 'user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    token,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number
    }
  };
}

async function forgotPassword({ email }) {
  if (!email) {
    throw new AppError(400, 'Email is required');
  }

  const userResult = await pool.query(
    'SELECT id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (userResult.rows.length === 0) {
    if (process.env.NODE_ENV === 'development') {
      throw new AppError(404, 'Email not found in our system. Please check if you registered with a different email address.');
    }

    return {
      message: 'If the email exists, a recovery code has been sent'
    };
  }

  const user = userResult.rows[0];
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + OTP_VERIFICATION_TIMEOUT);

  // Get user's phone number for OTP session
  const userPhoneResult = await pool.query(
    'SELECT phone_number FROM users WHERE id = $1',
    [user.id]
  );
  const phoneNumber = userPhoneResult.rows[0]?.phone_number;

  await pool.query(
    `INSERT INTO otp_sessions (phone_number, user_id, otp_hash, expires_at, verified, attempts, purpose) 
     VALUES ($1, $2, $3, $4, false, 0, 'password_reset')`,
    [phoneNumber, user.id, await bcrypt.hash(otp, 10), otpExpiry]
  );

  const emailResult = await sendPasswordRecoveryEmail(
    user.email,
    otp,
    `${user.first_name} ${user.last_name}`.trim()
  );

  if (emailResult.success) {
    log(`✅ Password recovery email sent to ${user.email}`);
  } else {
    log(`⚠️ Email failed, but OTP generated: ${otp}`);
    log(`❌ Email error: ${emailResult.error}`);
  }

  return {
    message: 'If the email exists, a recovery code has been sent',
    ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
  };
}

async function resetPassword({ email, otp, newPassword }) {
  if (!email || !otp || !newPassword) {
    throw new AppError(400, 'Email, OTP, and new password are required');
  }

  if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, 'Password must be at least 8 characters long');
  }

  const userResult = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  const user = userResult.rows[0];

  const otpSessions = await pool.query(
    `SELECT id, otp_hash, verified, attempts, expires_at 
       FROM otp_sessions 
       WHERE (user_id = $1 OR phone_number = (SELECT phone_number FROM users WHERE id = $1))
       AND purpose = 'password_reset'
       AND verified = false
       AND expires_at > NOW()
       AND attempts < 3
       ORDER BY created_at DESC
       LIMIT 1`,
    [user.id]
  );

  if (otpSessions.rows.length === 0) {
    throw new AppError(400, 'Invalid or expired recovery code');
  }

  const otpSession = otpSessions.rows[0];
  const isOtpValid = await bcrypt.compare(otp, otpSession.otp_hash);

  if (!isOtpValid) {
    await pool.query(
      'UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1',
      [otpSession.id]
    );
    throw new AppError(400, 'Invalid recovery code');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.query(
    'UPDATE user_auth_credentials SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
    [hashedPassword, user.id]
  );

  await pool.query(
    'UPDATE otp_sessions SET verified = true WHERE id = $1',
    [otpSession.id]
  );

  log(`✅ Customer password reset successful for ${email}`);

  return {
    message: 'Password reset successfully. Please login with your new password'
  };
}

async function getUserProfile(userId) {
  if (!userId) {
    throw new AppError(400, 'User ID required');
  }

  let userResult;
  try {
    userResult = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, 
              u.current_tier_id, u.profile_photo_url, u.created_at, u.last_login,
              u.available_tokens, u.total_tokens_earned, u.total_tokens_spent,
              r.role_name, r.id as role_id
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
  } catch (roleError) {
    const errorMsg = roleError.message || '';
    const isRoleIdError = roleError.code === '42703' ||
      errorMsg.toLowerCase().includes('role_id') ||
      errorMsg.toLowerCase().includes('does not exist');

    if (isRoleIdError) {
      userResult = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, 
                u.current_tier_id, u.profile_photo_url, u.created_at, u.last_login,
                u.available_tokens, u.total_tokens_earned, u.total_tokens_spent
         FROM users u
         WHERE u.id = $1`,
        [userId]
      );
      if (userResult.rows.length > 0) {
        userResult.rows[0].role_name = 'user';
        userResult.rows[0].role_id = null;
      }
    } else {
      throw roleError;
    }
  }

  if (userResult.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  const user = userResult.rows[0];
  
  // Get tier name if tier_id exists
  let tierName = null;
  if (user.current_tier_id) {
    try {
      const tierResult = await pool.query(
        'SELECT name FROM tiers WHERE id = $1',
        [user.current_tier_id]
      );
      tierName = tierResult.rows[0]?.name || null;
    } catch (tierError) {
      // Tier table might not exist, ignore
    }
  }

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone_number: user.phone_number,
    profile_photo_url: user.profile_photo_url,
    role_name: user.role_name || 'user',
    role_id: user.role_id || null,
    current_tier_id: user.current_tier_id,
    tier_name: tierName,
    created_at: user.created_at,
    last_login: user.last_login,
    // EZT Token balances (frontend expects these field names)
    ezt_balance: parseFloat(user.available_tokens || 0),
    ezt_total_earned: parseFloat(user.total_tokens_earned || 0),
    ezt_total_spent: parseFloat(user.total_tokens_spent || 0)
  };
}

module.exports = {
  sendOtp,
  verifyOtp,
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getUserProfile
};

