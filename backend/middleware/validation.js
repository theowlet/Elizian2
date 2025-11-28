// Input validation middleware

const validatePhoneNumber = (req, res, next) => {
  const { phone_number } = req.body;
  
  if (!phone_number) {
    return res.status(400).json({
      success: false,
      message: 'Phone number is required'
    });
  }
  
  // Clean phone number - remove spaces, dashes, parentheses, and leading country code
  const cleanPhone = phone_number.replace(/[\s\-+()]/g, '').replace(/^91/, '');
  
  // Validate it's exactly 10 digits
  if (!/^\d{10}$/.test(cleanPhone)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid phone number format. Must be 10 digits.'
    });
  }
  
  // Update the request body with cleaned phone number
  req.body.phone_number = cleanPhone;
  next();
};

const validateEmail = (req, res, next) => {
  const { email } = req.body;
  
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }
  }
  
  next();
};

const validateRequired = (requiredFields) => {
  return (req, res, next) => {
    // Fallback logic: If 'name' is required but not provided,
    // check if first_name and/or last_name are available.
    // Combine them into req.body.name before validation.
    if (requiredFields.includes('name') && !req.body.name) {
      const firstName = req.body.first_name || '';
      const lastName = req.body.last_name || '';
      
      // Only combine if at least one part is provided
      if (firstName || lastName) {
        req.body.name = `${firstName} ${lastName}`.trim();
      }
      // If both are empty, validation will catch it below as missing 'name'
    }
    
    // Validate that all required fields are present in req.body
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

const validatePassword = (req, res, next) => {
  const { password } = req.body;
  
  if (password) {
    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }
    
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      });
    }
  }
  
  next();
};

const sanitizeInput = (req, res, next) => {
  // Basic input sanitization
  const sanitizeObject = (obj) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        sanitized[key] = value.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

module.exports = {
  validatePhoneNumber,
  validateEmail,
  validateRequired,
  validatePassword,
  sanitizeInput
};
