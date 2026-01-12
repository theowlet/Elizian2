const partnerRepository = require('../repositories/partnerRepository');
const partnerAuthRepository = require('../repositories/partnerAuthRepository');
const partnerOtpRepository = require('../repositories/partnerOtpRepository');
const { sendPasswordRecoveryEmail } = require('../../emailService');
const { AppError } = require('../../utils/response');
const { logError, log } = require('../../utils/logger');

// Forgot password - send OTP
async function forgotPassword(email) {
  if (!email) {
    throw new AppError(400, "Email is required");
  }

  const partner = await partnerRepository.getPartnerByEmail(email);
  if (!partner) {
    // In production, don't reveal if email exists
    if (process.env.NODE_ENV === 'production') {
      return { message: "If the email exists, a recovery code has been sent" };
    }
    throw new AppError(404, "Email not found in our system");
  }

  // Check for recent OTP requests (rate limiting)
  const recentCount = await partnerOtpRepository.countRecentOtps(partner.id, 'password_recovery', 1);
  if (recentCount > 0) {
    throw new AppError(429, "Please wait before requesting another code");
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  // Store OTP
  await partnerOtpRepository.createOtp(partner.id, otp, 'password_recovery', otpExpiry);

  // Send email
  const emailResult = await sendPasswordRecoveryEmail(partner.email, otp, partner.name);
  
  // Log OTP in development mode (always log for testing)
  if (process.env.NODE_ENV === 'development' || process.env.LOG_OTP === 'true') {
    log(`🔐 [DEV] Partner Password Recovery OTP for ${partner.email}: ${otp} (expires in 15 minutes)`);
  }
  
  if (emailResult.success) {
    log(`✅ Password recovery email sent to ${partner.email}`);
  } else {
    log(`⚠️ Email failed, but OTP generated: ${otp}`);
    logError(`❌ Email error: ${emailResult.error}`);
  }

  return {
    message: "If the email exists, a recovery code has been sent",
    ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
  };
}

// Reset password - verify OTP and update password
async function resetPassword(email, otp, newPassword) {
  if (!email || !otp || !newPassword) {
    throw new AppError(400, "Email, OTP, and new password are required");
  }

  if (newPassword.length < 6) {
    throw new AppError(400, "Password must be at least 6 characters long");
  }

  // Verify OTP
  const otpRecord = await partnerOtpRepository.verifyOtp(email, otp, 'password_recovery');
  if (!otpRecord) {
    throw new AppError(400, "Invalid or expired recovery code");
  }

  // Hash new password
  const passwordHash = await partnerAuthRepository.hashPassword(newPassword);

  // Update password
  await partnerAuthRepository.updatePartnerPassword(otpRecord.partner_id, passwordHash);

  // Mark OTP as used
  await partnerOtpRepository.markOtpAsUsed(otpRecord.id);

  log(`✅ Password reset successful for ${email}`);
  return { message: "Password reset successfully. Please login with your new password" };
}

// Resend OTP
async function resendOtp(email) {
  if (!email) {
    throw new AppError(400, "Email is required");
  }

  const partner = await partnerRepository.getPartnerByEmail(email);
  if (!partner) {
    return { message: "If the email exists, a new recovery code has been sent" };
  }

  // Check for recent OTP requests (rate limiting)
  const recentCount = await partnerOtpRepository.countRecentOtps(partner.id, 'password_recovery', 1);
  if (recentCount > 0) {
    throw new AppError(429, "Please wait before requesting another code");
  }

  // Generate new OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 15 * 60 * 1000);

  await partnerOtpRepository.createOtp(partner.id, otp, 'password_recovery', otpExpiry);

  const emailResult = await sendPasswordRecoveryEmail(partner.email, otp, partner.name);
  
  // Log OTP in development mode (always log for testing)
  if (process.env.NODE_ENV === 'development' || process.env.LOG_OTP === 'true') {
    log(`🔐 [DEV] Partner Password Recovery OTP (Resend) for ${partner.email}: ${otp} (expires in 15 minutes)`);
  }
  
  if (emailResult.success) {
    log(`✅ Password recovery email resent to ${partner.email}`);
  } else {
    log(`⚠️ Email failed, but OTP generated: ${otp}`);
  }

  return {
    message: "If the email exists, a new recovery code has been sent",
    ...(process.env.NODE_ENV === 'development' && !emailResult.success && { otp })
  };
}

module.exports = {
  forgotPassword,
  resetPassword,
  resendOtp
};

