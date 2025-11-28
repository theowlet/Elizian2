class AppError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
}

const successResponse = (res, statusCode, message = 'Success', data = null) => {
  res.status(statusCode).json({ success: true, message, data });
};

const errorResponse = (res, statusCode, message, details = null) => {
  const response = { success: false, error: message };
  if (details) {
    response.details = details;
  }
  res.status(statusCode).json(response);
};

module.exports = {
  AppError,
  successResponse,
  errorResponse
};

