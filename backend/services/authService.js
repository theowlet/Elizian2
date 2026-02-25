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
const { sendSms } = require("../utils/sendSMS");
const { ethers } = require('ethers');

const pool = getPool();

// Constants
const OTP_VERIFICATION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const OTP_REGISTRATION_TIMEOUT = 60 * 60 * 1000; // 60 minutes (1 hour) for registration flow - extended to allow time for form filling
const PASSWORD_MIN_LENGTH = 8;
const ETH_RPC_URL = 'https://sepolia.infura.io/v3/b12ace21fc3e474e9827d5639ce7e9b5';
const TOKEN_CONTRACT_ADDRESS = '0x148ab417973b5a2b1063c2ef9b56037debadc066';
const MASTER_WALLET_ADDRESS = '0xC07f47FdC9037477BAD29D5eEc9390B1e46037be';

async function sendOtp({ phoneNumber, countryCode = '+91', purpose = 'login', logToFile = true }) {
  if (!phoneNumber) {
    throw new AppError(400, 'Phone number required');
  }

  const otp = generateOTP();
  await sendSms(
    `${countryCode}${phoneNumber}`,
    `Elizian Verification Code: ${otp}. Enter this code to complete your login.`
  );
  const hashedOtp = await bcrypt.hash(otp, 5);
  const expiresAt = new Date(Date.now() + OTP_VERIFICATION_TIMEOUT);

  // CRITICAL FIX:
  // Always clear ALL existing OTP sessions for this phone (both verified and unverified)
  // before inserting a new one.
  //
  // Previous behaviour:
  // - Only deleted unverified sessions.
  // - A previously verified (and possibly expired) OTP session could remain.
  // - verifyOtp() would then lock and use that old session row, causing:
  //   • "OTP already verified" errors on re-use, or
  //   • registration to see an old verified_at and treat it as expired.
  //
  // New behaviour:
  // - Every time we send a new OTP, we wipe all prior sessions for that phone.
  // - The next verifyOtp() + registerUser() flow always uses the fresh OTP row.
  await pool.query(
    `DELETE FROM otp_sessions WHERE phone_number = $1`,
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

    // Check for existing user (locked) and M-PIN status
    // Use FOR UPDATE OF u to explicitly lock only the users table (not the nullable LEFT JOIN side)
    const existingUser = await client.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.current_tier_id,
              COALESCE(auth.mpin_hash IS NOT NULL, false) as has_mpin
       FROM users u
       LEFT JOIN user_auth_credentials auth ON auth.user_id = u.id
       WHERE u.phone_number = $1
       FOR UPDATE OF u`,
      [phoneNumber]
    );

    await client.query('COMMIT');

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      const hasMpin = user.has_mpin || false;

      // If user has M-PIN, don't auto-login - return has_mpin flag instead
      if (hasMpin) {
        return {
          requires_registration: false,
          has_mpin: true,
          user: {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            email: user.email,
            phone_number: user.phone_number
          }
        };
      }

      // User exists but no M-PIN - auto-login with OTP (existing behavior)
      const token = jwt.sign(
        {
          userId: user.id,
          phone: user.phone_number,
          type: 'user'
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return {
        token,
        user,
        requires_registration: false,
        has_mpin: false
      };
    }

    return {
      requires_registration: true,
      has_mpin: false
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function formatName({ firstName, lastName, name }) {
  let formattedFirst = (firstName || "").trim();
  let formattedLast = (lastName || "").trim();

  if (!formattedFirst && name) {
    const nameParts = (name || "").trim().split(/\s+/);
    formattedFirst = nameParts[0] || "";
    formattedLast = nameParts.slice(1).join(" ") || "";
  }

  if (!formattedFirst) {
    throw new AppError(
      400,
      "First name is required. Provide either 'first_name' or 'name' field."
    );
  }

  return { firstName: formattedFirst, lastName: formattedLast };
}

function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new AppError(400, "Phone number is required for user registration.");
  }
  let clean = String(phoneNumber).replace(/\D/g, "");
  if (clean.startsWith("91") && clean.length === 12) {
    clean = clean.substring(2);
  }
  if (clean.length !== 10 || !/^\d{10}$/.test(clean)) {
    throw new AppError(
      400,
      "Invalid phone number format. Must be exactly 10 digits."
    );
  }
  return clean;
}

async function ensureRole(dbRoleName) {
  const roleResult = await pool.query(
    "SELECT id FROM roles WHERE role_name = $1 LIMIT 1",
    [dbRoleName]
  );
  const roleId = roleResult.rows[0]?.id;
  if (!roleId) {
    throw new AppError(
      500,
      `Role '${dbRoleName}' not found. Please initialize database tables.`
    );
  }
  return roleId;
}

async function getDefaultTier() {
  const tierRes = await pool.query(
    "SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1"
  );
  const tierId = tierRes.rows[0]?.id || null;
  if (!tierId) {
    throw new AppError(
      500,
      "Default tier not found. Please run the seed script."
    );
  }
  return tierId;
}

async function registerSuperAdmin({
  phoneNumber,
  email,
  password,
  firstName,
  lastName,
}) {
  if (!email || !password) {
    throw new AppError(400, "Super Admin requires email and password.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "Invalid email format.");
  }

  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, "Password must be at least 8 characters long");
  }

  let existingSuperAdmin = { rows: [] };
  try {
    existingSuperAdmin = await pool.query(
      `SELECT u.id FROM users u 
           JOIN roles r ON u.role_id = r.id 
           WHERE r.role_name IN ('super_admin', 'admin', 'super-admin') LIMIT 1`
    );
  } catch (roleCheckError) {
    const errorMsg = roleCheckError.message || "";
    const isRoleIdError =
      roleCheckError.code === "42703" ||
      errorMsg.toLowerCase().includes("role_id") ||
      errorMsg.toLowerCase().includes("does not exist");
    if (!isRoleIdError) {
      throw roleCheckError;
    }
  }

  if (existingSuperAdmin.rows.length > 0) {
    throw new AppError(
      409,
      "Super Admin already exists. Please log in instead."
    );
  }

  const existingEmail = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [email]
  );
  if (existingEmail.rows.length > 0) {
    throw new AppError(409, "Email already registered.");
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
    const errorMsg = roleError.message || "";
    const isRoleIdError =
      roleError.code === "42703" ||
      errorMsg.toLowerCase().includes("role_id") ||
      errorMsg.toLowerCase().includes("does not exist");
    if (!isRoleIdError) {
      throw roleError;
    }
  }

  let tierResult = await pool.query(
    "SELECT id FROM tiers WHERE LOWER(name) IN ('ather', 'aether') ORDER BY name LIMIT 1"
  );
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
      throw new Error("roleId is null, try without role_id");
    }
  } catch (insertError) {
    const errorMsg = insertError.message || "";
    const isRoleIdError =
      insertError.code === "42703" ||
      errorMsg.toLowerCase().includes("role_id") ||
      errorMsg.toLowerCase().includes("does not exist");
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
      role: "super_admin",
      type: "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return {
    token,
    user: {
      id: userId,
      phone_number: phoneNumber || null,
      email,
      first_name: firstName,
      last_name: lastName,
      role: "super_admin",
      current_tier_id: tierId,
    },
  };
}

async function registerUser(payload) {
  const { role = "user", email, password, first_name, last_name } = payload;
  const { firstName, lastName } = formatName({ firstName: first_name, lastName: last_name, name: `${first_name} ${last_name}` });

  if (role === "super_admin") {
    return registerSuperAdmin({
      phoneNumber: payload.phone_number,
      email,
      password,
      firstName,
      lastName,
    });
  }

  const cleanPhone = sanitizePhoneNumber(payload.phone_number);

  // CRITICAL FIX: Registration should NEVER require otp_code
  // OTP was already verified - backend trusts the verified session
  // Registration consumes that trust - does NOT re-validate OTP
  // If otp_code is provided (shouldn't happen), ignore it and check verified session instead
  if (payload.otp_code) {
    // Log warning but don't use otp_code - trust verified session instead
    log('WARNING: Registration received otp_code - ignoring and checking verified session instead');
  }

  // Always check verified session (don't require otp_code)
  // Registration must trust the already-verified OTP session
  const otpCheck = await pool.query(
    `SELECT id, verified, expires_at, created_at, verified_at 
       FROM otp_sessions
       WHERE phone_number = $1 AND verified = true 
       ORDER BY verified_at DESC`,
    [cleanPhone]
  );

  if (otpCheck.rows.length === 0 || !otpCheck.rows[0].verified) {
    throw new AppError(
      403,
      "OTP verification required before registration. Please verify your phone number first."
    );
  }

  // NOTE: We intentionally do NOT enforce an additional client-side
  //       "registration window" timeout here anymore.
  //       As long as there is a verified OTP session for this phone,
  //       registration is allowed. The OTP itself already has a 10‑minute
  //       expiry in verifyOtp(), so we avoid double‑expiring and blocking
  //       valid flows that take longer to fill the form or that re‑use
  //       a just‑verified session.

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "Invalid email format.");
  }

  if (
    password &&
    password.length > 0 &&
    password.length < PASSWORD_MIN_LENGTH
  ) {
    throw new AppError(400, "Password must be at least 8 characters long");
  }

  const existingUserByPhone = await pool.query(
    "SELECT id FROM users WHERE phone_number = $1",
    [cleanPhone]
  );
  if (existingUserByPhone.rows.length > 0) {
    throw new AppError(
      409,
      "User with this phone number already exists. Please log in instead."
    );
  }

  if (email) {
    const existingUserByEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existingUserByEmail.rows.length > 0) {
      throw new AppError(409, "User with this email already exists.");
    }
  }

  let dbRoleName = "user";
  if (role === "partner") {
    dbRoleName = "partner_admin";
  }

  const roleId = await ensureRole(dbRoleName);
  const tierId = await getDefaultTier();

  const passwordHash =
    password && password.length > 0 ? await bcrypt.hash(password, 10) : null;

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

  // Generate Ethereum account and send tokens
  try {
    const wallet = ethers.Wallet.createRandom();
    const publicKey = wallet.address;
    const privateKey = wallet.privateKey;

    await pool.query(
      `INSERT INTO accounts (user_id, public_key, private_key) VALUES ($1, $2, $3)`,
      [userId, publicKey, privateKey]
    );

    log(`✅ Ethereum account created for user ${userId}: ${publicKey}`);

    if (process.env.MASTER_PRIVATE_KEY) {
      const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
      const masterWallet = new ethers.Wallet(process.env.MASTER_PRIVATE_KEY, provider);
      const tokenContract = new ethers.Contract(
        TOKEN_CONTRACT_ADDRESS,
        ["function transfer(address to, uint256 amount) returns (bool)"],
        masterWallet
      );

      const amount = ethers.parseUnits("100", 18);
      const tx = await tokenContract.transfer(publicKey, amount);
      log(`🚀 Token transfer transaction sent: ${tx.hash}`);
      await tx.wait();
      log(`✅ Successfully sent 100 tokens to ${publicKey}`);
    } else {
      logError("⚠️ MASTER_PRIVATE_KEY is missing from environment variables. Skipping token transfer.");
    }
  } catch (error) {
    logError("❌ Error in Ethereum integration:", error);
    // Non-blocking for registration - we don't want to fail registration if Ethereum logic fails
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
      type: "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  // --- Ethereum Integration Start ---
  try {
    // 1. Create a new Ethereum wallet for the user
    const newWallet = ethers.Wallet.createRandom();
    const userAddress = newWallet.address;
    const userPrivateKey = newWallet.privateKey;

    // 2. Save account details to DB
    await pool.query(
      `INSERT INTO accounts (user_id, public_key, private_key) VALUES ($1, $2, $3)`,
      [userId, userAddress, userPrivateKey]
    );

    log(`✅ Generated ETH wallet for user ${userId}: ${userAddress}`);

    // 3. Initiate Token Transfer from Master Wallet (User requested blocking "Then, once thats done...")
    if (process.env.MASTER_PRIVATE_KEY) {
      log('Starting token transfer...');
      const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);
      const wallet = new ethers.Wallet(process.env.MASTER_PRIVATE_KEY, provider);

      const tokenAbi = [
        "function transfer(address to, uint256 amount) returns (bool)"
      ];
      const tokenContract = new ethers.Contract(ETH_TOKEN_CONTRACT_ADDRESS, tokenAbi, wallet);

      const amountToSend = ethers.parseUnits("100", 18); // Assuming 18 decimals, sending 100 tokens

      const tx = await tokenContract.transfer(userAddress, amountToSend);
      log(`Token transfer transaction sent: ${tx.hash}`);

      await tx.wait(); // Wait for confirmation
      log(`✅ Token transfer confirmed for user ${userId}`);
    } else {
      logError('⚠️ MASTER_PRIVATE_KEY not found in env. Token transfer skipped.');
    }
  } catch (ethError) {
    // Prevent registration failure if crypto stuff check fails, although requirements implied sequence.
    // Ideally we should transaction-wrap the whole thing if it was strict, but user creation is done.
    // Logging error and continuing.
    logError(`❌ Ethereum integration failed for user ${userId}:`, ethError);
  }
  // --- Ethereum Integration End ---
  return {
    token,
    user: {
      id: userId,
      phone_number: cleanPhone,
      email: email || null,
      first_name: firstName,
      last_name: lastName,
      role: dbRoleName,
      current_tier_id: tierId,
    },
  };
}

async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new AppError(400, "Email and password required");
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
    const errorMsg = roleError.message || "";
    const isRoleIdError =
      roleError.code === "42703" ||
      errorMsg.toLowerCase().includes("role_id") ||
      errorMsg.toLowerCase().includes("does not exist");

    if (isRoleIdError) {
      userRes = await pool.query(
        `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, c.password_hash
           FROM users u
           JOIN user_auth_credentials c ON u.id = c.user_id
           WHERE LOWER(u.email) = $1`,
        [normalizedEmail]
      );
      if (userRes.rows.length > 0) {
        userRes.rows[0].role_name = "user";
      }
    } else {
      throw roleError;
    }
  }
  if (userRes.rows.length === 0) {
    logError(`[User Login] User not found for email: ${normalizedEmail}`);
    throw new AppError(400, "Invalid credentials");
  }

  const user = userRes.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    logError(
      `[User Login] Invalid password for user: ${user.id} (${normalizedEmail})`
    );
    throw new AppError(400, "Invalid credentials");
  }

  const token = jwt.sign(
    {
      userId: user.id,
      role: user.role_name || "user",
      type: "user",
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  return {
    token,
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number,
    },
  };
}

async function forgotPassword({ email }) {
  if (!email) {
    throw new AppError(400, "Email is required");
  }

  const userResult = await pool.query(
    "SELECT id, first_name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)",
    [email]
  );

  if (userResult.rows.length === 0) {
    if (process.env.NODE_ENV === "development") {
      throw new AppError(
        404,
        "Email not found in our system. Please check if you registered with a different email address."
      );
    }

    return {
      message: "If the email exists, a recovery code has been sent",
    };
  }

  const user = userResult.rows[0];
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + OTP_VERIFICATION_TIMEOUT);

  // Get user's phone number for OTP session
  const userPhoneResult = await pool.query(
    "SELECT phone_number FROM users WHERE id = $1",
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
    message: "If the email exists, a recovery code has been sent",
    ...(process.env.NODE_ENV === "development" &&
      !emailResult.success && { otp }),
  };
}

async function resetPassword({ email, otp, newPassword }) {
  if (!email || !otp || !newPassword) {
    throw new AppError(400, "Email, OTP, and new password are required");
  }

  if (!newPassword || newPassword.length < PASSWORD_MIN_LENGTH) {
    throw new AppError(400, "Password must be at least 8 characters long");
  }

  const userResult = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
    [email]
  );

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found");
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
    throw new AppError(400, "Invalid or expired recovery code");
  }

  const otpSession = otpSessions.rows[0];
  const isOtpValid = await bcrypt.compare(otp, otpSession.otp_hash);

  if (!isOtpValid) {
    await pool.query(
      "UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1",
      [otpSession.id]
    );
    throw new AppError(400, "Invalid recovery code");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.query(
    "UPDATE user_auth_credentials SET password_hash = $1, updated_at = NOW() WHERE user_id = $2",
    [hashedPassword, user.id]
  );

  await pool.query("UPDATE otp_sessions SET verified = true WHERE id = $1", [
    otpSession.id,
  ]);

  log(`✅ Customer password reset successful for ${email}`);

  return {
    message: "Password reset successfully. Please login with your new password",
  };
}

async function getUserProfile(userId) {
  if (!userId) {
    throw new AppError(400, "User ID required");
  }

  // Optional column: may not exist on older or minimal local DB
  let hasLastLogin = false;
  try {
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'last_login' LIMIT 1`
    );
    hasLastLogin = col.rowCount > 0;
  } catch (_) {}

  const userCols = [
    "u.id", "u.first_name", "u.last_name", "u.email", "u.phone_number",
    "u.current_tier_id", "u.profile_photo_url", "u.created_at",
    "u.available_tokens", "u.total_tokens_earned", "u.total_tokens_spent",
  ];
  if (hasLastLogin) userCols.push("u.last_login");

  let userResult;
  try {
    userResult = await pool.query(
      `SELECT ${userCols.join(", ")},
              r.role_name, r.id as role_id
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
  } catch (roleError) {
    const errorMsg = roleError.message || "";
    const isRoleIdError =
      roleError.code === "42703" ||
      errorMsg.toLowerCase().includes("role_id") ||
      errorMsg.toLowerCase().includes("does not exist");

    if (isRoleIdError) {
      userResult = await pool.query(
        `SELECT ${userCols.join(", ")} FROM users u WHERE u.id = $1`,
        [userId]
      );
      if (userResult.rows.length > 0) {
        userResult.rows[0].role_name = "user";
        userResult.rows[0].role_id = null;
      }
    } else {
      throw roleError;
    }
  }

  if (userResult.rows.length === 0) {
    throw new AppError(404, "User not found");
  }

  const user = userResult.rows[0];

  // Get tier name — prefer current_tier_name (new enterprise system) over old tiers table
  let tierName = null;
  try {
    const tierResult = await pool.query(
      "SELECT current_tier_name FROM users WHERE id = $1",
      [userId]
    );
    tierName = tierResult.rows[0]?.current_tier_name || null;
  } catch (_) {}
  // Fallback to old tiers table if current_tier_name not available
  if (!tierName && user.current_tier_id) {
    try {
      const tierResult = await pool.query(
        "SELECT name FROM tiers WHERE id = $1",
        [user.current_tier_id]
      );
      tierName = tierResult.rows[0]?.name || null;
    } catch (tierError) {
      // Tier table might not exist, ignore
    }
  }

  // EZ Club (optional columns - may not exist before migration)
  let ezClub = { member: false, network_check_ins: 0, qualified_at: null };
  try {
    const ezResult = await pool.query(
      'SELECT ez_club_member, ez_club_network_check_ins, ez_club_qualified_at FROM users WHERE id = $1',
      [userId]
    );
    if (ezResult.rows[0]) {
      const r = ezResult.rows[0];
      ezClub = {
        member: !!r.ez_club_member,
        network_check_ins: parseInt(r.ez_club_network_check_ins || 0, 10),
        qualified_at: r.ez_club_qualified_at || null,
      };
    }
  } catch (_) {}

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone_number: user.phone_number,
    profile_photo_url: user.profile_photo_url,
    role_name: user.role_name || "user",
    role_id: user.role_id || null,
    current_tier_id: user.current_tier_id,
    tier_name: tierName,
    created_at: user.created_at,
    last_login: user.last_login != null ? user.last_login : null,
    // EZT Token balances (frontend expects these field names)
    ezt_balance: parseFloat(user.available_tokens || 0),
    ezt_total_earned: parseFloat(user.total_tokens_earned || 0),
    ezt_total_spent: parseFloat(user.total_tokens_spent || 0),
    // EZ Club (cross-network tier)
    ez_club: ezClub,
  };
}

async function updateProfilePhoto(userId, photoUrl) {
  if (!userId) {
    throw new AppError(400, "User ID required");
  }
  if (!photoUrl || String(photoUrl).trim() === "") {
    throw new AppError(400, "Photo URL required");
  }
  await pool.query(
    "UPDATE users SET profile_photo_url = $2 WHERE id = $1",
    [userId, photoUrl]
  );
  return { photo_url: photoUrl };
}

// ==========================================
// M-PIN FUNCTIONS
// ==========================================

/**
 * Set M-PIN for a user
 * @param {string} userId - User ID
 * @param {string} mpin - 4-digit M-PIN
 */
async function setMpin(userId, mpin) {
  if (!userId || !mpin) {
    throw new AppError(400, 'User ID and M-PIN are required');
  }

  // Validate M-PIN format (exactly 4 digits)
  if (!/^\d{4}$/.test(mpin)) {
    throw new AppError(400, 'M-PIN must be exactly 4 digits');
  }

  // Hash M-PIN
  const mpinHash = await bcrypt.hash(mpin, 10);

  // Check if user_auth_credentials record exists
  const existingCreds = await pool.query(
    `SELECT id FROM user_auth_credentials WHERE user_id = $1`,
    [userId]
  );

  if (existingCreds.rows.length === 0) {
    // No credentials record exists - create one with a dummy password_hash
    // (user authenticated via OTP, so password_hash is not required but column is NOT NULL)
    const dummyPasswordHash = await bcrypt.hash('otp-authenticated-user', 10);
    await pool.query(
      `INSERT INTO user_auth_credentials (user_id, password_hash, mpin_hash, mpin_set_at, mpin_failed_attempts, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), 0, NOW(), NOW())`,
      [userId, dummyPasswordHash, mpinHash]
    );
  } else {
    // Update existing record
    await pool.query(
      `UPDATE user_auth_credentials 
       SET mpin_hash = $1,
           mpin_set_at = COALESCE(mpin_set_at, NOW()),
           mpin_failed_attempts = 0,
           mpin_locked_until = NULL,
           updated_at = NOW()
       WHERE user_id = $2`,
      [mpinHash, userId]
    );
  }

  return { success: true, message: 'M-PIN set successfully' };
}

/**
 * Verify M-PIN for login
 * @param {string} phoneNumber - User phone number
 * @param {string} mpin - 4-digit M-PIN
 */
async function verifyMpin(phoneNumber, mpin) {
  if (!phoneNumber || !mpin) {
    throw new AppError(400, 'Phone number and M-PIN are required');
  }

  // Validate M-PIN format
  if (!/^\d{4}$/.test(mpin)) {
    throw new AppError(400, 'M-PIN must be exactly 4 digits');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get user and M-PIN hash with lock
    const userResult = await client.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.phone_number, u.current_tier_id,
              auth.mpin_hash, auth.mpin_failed_attempts, auth.mpin_locked_until
       FROM users u
       JOIN user_auth_credentials auth ON auth.user_id = u.id
       WHERE u.phone_number = $1
       FOR UPDATE OF auth`,
      [phoneNumber]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(404, 'User not found');
    }

    const user = userResult.rows[0];

    // Check if M-PIN is set
    if (!user.mpin_hash) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'M-PIN not set. Please use OTP login.');
    }

    // Check if account is locked
    if (user.mpin_locked_until && new Date(user.mpin_locked_until) > new Date()) {
      await client.query('ROLLBACK');
      const lockMinutes = Math.ceil((new Date(user.mpin_locked_until) - new Date()) / 60000);
      throw new AppError(403, `Account locked. Try again in ${lockMinutes} minute(s) or use OTP login.`);
    }

    // Verify M-PIN
    const mpinMatch = await bcrypt.compare(mpin, user.mpin_hash);

    if (!mpinMatch) {
      // Increment failed attempts
      const newAttempts = (user.mpin_failed_attempts || 0) + 1;
      const maxAttempts = 5;

      let lockUntil = null;
      if (newAttempts >= maxAttempts) {
        // Lock for 15 minutes
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await client.query(
        `UPDATE user_auth_credentials 
         SET mpin_failed_attempts = $1, mpin_locked_until = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [newAttempts, lockUntil, user.id]
      );

      await client.query('COMMIT');

      if (newAttempts >= maxAttempts) {
        throw new AppError(403, 'Too many failed attempts. Account locked for 15 minutes. Use OTP login instead.');
      }

      const remaining = maxAttempts - newAttempts;
      throw new AppError(400, `Invalid M-PIN. ${remaining} attempt(s) remaining.`);
    }

    // M-PIN verified - reset failed attempts and generate token
    await client.query(
      `UPDATE user_auth_credentials 
       SET mpin_failed_attempts = 0, mpin_locked_until = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [user.id]
    );

    await client.query('COMMIT');

    const token = jwt.sign(
      {
        userId: user.id,
        phone: user.phone_number,
        type: 'user'
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    return {
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        current_tier_id: user.current_tier_id
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if user has M-PIN set
 * @param {string} phoneNumber - User phone number
 */
async function checkMpinExists(phoneNumber) {
  if (!phoneNumber) {
    throw new AppError(400, 'Phone number is required');
  }

  const result = await pool.query(
    `SELECT COALESCE(auth.mpin_hash IS NOT NULL, false) as has_mpin
     FROM users u
     LEFT JOIN user_auth_credentials auth ON auth.user_id = u.id
     WHERE u.phone_number = $1`,
    [phoneNumber]
  );

  if (result.rows.length === 0) {
    throw new AppError(404, 'User not found');
  }

  return { has_mpin: result.rows[0].has_mpin };
}

/**
 * Reset M-PIN (requires OTP verification first)
 * @param {string} userId - User ID
 * @param {string} mpin - New 4-digit M-PIN
 */
async function resetMpin(userId, mpin) {
  if (!userId || !mpin) {
    throw new AppError(400, 'User ID and M-PIN are required');
  }

  // Validate M-PIN format
  if (!/^\d{4}$/.test(mpin)) {
    throw new AppError(400, 'M-PIN must be exactly 4 digits');
  }

  // Hash M-PIN
  const mpinHash = await bcrypt.hash(mpin, 10);

  // Update M-PIN and reset failed attempts
  await pool.query(
    `UPDATE user_auth_credentials 
     SET mpin_hash = $1,
         mpin_set_at = NOW(),
         mpin_failed_attempts = 0,
         mpin_locked_until = NULL,
         updated_at = NOW()
     WHERE user_id = $2`,
    [mpinHash, userId]
  );

  return { success: true, message: 'M-PIN reset successfully' };
}

module.exports = {
  sendOtp,
  verifyOtp,
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  setMpin,
  verifyMpin,
  checkMpinExists,
  resetMpin,
  updateProfilePhoto,
};
