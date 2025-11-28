const { logError } = require('../utils/logger');
const { AppError } = require('../utils/response');

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;
  const payload = {
    success: false,
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    requestId: req.requestId
  };

  if (err.details) {
    payload.details = err.details;
  }

  if (statusCode >= 500) {
    logError('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      requestId: req.requestId
    });
  }

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;

