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

const errorResponse = (res, statusCodeOrError, message, details = null) => {
  let statusCode = statusCodeOrError;
  let msg = message;
  if (statusCodeOrError && typeof statusCodeOrError === 'object' && !Number.isInteger(statusCodeOrError)) {
    const err = statusCodeOrError;
    statusCode = err.statusCode || err.status || 500;
    msg = err.message || err.error || 'Request failed';
    if (err.details) details = err.details;
  }
  const response = { success: false, message: msg, error: msg };
  if (details) {
    response.details = details;
  }
  res.status(Number(statusCode) || 500).json(response);
};

module.exports = {
  AppError,
  successResponse,
  errorResponse
};

