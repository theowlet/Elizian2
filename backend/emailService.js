const nodemailer = require('nodemailer');

// Email configuration for Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'your-gmail@gmail.com',
      pass: process.env.EMAIL_PASS || 'your-app-password'
    }
  });
};

// Send password recovery OTP email
const sendPasswordRecoveryEmail = async (email, otp, partnerName = 'Partner') => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"EZNet Partner Console" <${process.env.EMAIL_USER || 'partners@elizian.xyz'}>`,
      to: email,
      subject: '🔐 Password Recovery - EZNet Partner Console',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #5E17EB, #24105F); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">🔐 Password Recovery</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">EZNet Partner Console</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <h2 style="color: #333; margin-top: 0;">Hello ${partnerName}!</h2>
            
            <p style="color: #666; line-height: 1.6;">
              We received a request to reset your password for the EZNet Partner Console. 
              Use the verification code below to reset your password:
            </p>
            
            <div style="background: #5E17EB; color: white; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
              <h1 style="margin: 0; font-size: 36px; letter-spacing: 5px; font-family: 'Courier New', monospace;">${otp}</h1>
            </div>
            
            <p style="color: #666; line-height: 1.6;">
              <strong>Important:</strong>
            </p>
            <ul style="color: #666; line-height: 1.6;">
              <li>This code will expire in <strong>10 minutes</strong></li>
              <li>This code can only be used once</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                This is an automated message from EZNet Partner Console. 
                Please do not reply to this email.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Password recovery email sent to ${email}:`, result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    return { success: false, error: error.message };
  }
};

// Send welcome email for new partners
const sendWelcomeEmail = async (email, partnerName, loginUrl) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `"EZNet Partner Console" <${process.env.EMAIL_USER || 'partners@elizian.xyz'}>`,
      to: email,
      subject: '🎉 Welcome to EZNet Partner Console!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #5E17EB, #24105F); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Welcome to EZNet!</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Partner Console</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
            <h2 style="color: #333; margin-top: 0;">Hello ${partnerName}!</h2>
            
            <p style="color: #666; line-height: 1.6;">
              Welcome to the EZNet Partner Console! Your account has been successfully created and you can now start managing your events and services.
            </p>
            
            <div style="background: #e8f5e8; border: 1px solid #4CAF50; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h3 style="color: #2e7d32; margin-top: 0;">🚀 Get Started</h3>
              <p style="color: #2e7d32; margin-bottom: 15px;">Access your Partner Console:</p>
              <a href="${loginUrl}" style="background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
                Login to Partner Console
              </a>
            </div>
            
            <h3 style="color: #333;">What you can do:</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li>📝 Manage your venue profile and details</li>
              <li>🎉 Create and manage events</li>
              <li>🍽️ Add menu items and services</li>
              <li>📊 View analytics and reports</li>
              <li>📱 Manage bookings and orders</li>
            </ul>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                Need help? Contact our support team or check our documentation.
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${email}:`, result.messageId);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error(`❌ Failed to send welcome email to ${email}:`, error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendPasswordRecoveryEmail,
  sendWelcomeEmail
};
