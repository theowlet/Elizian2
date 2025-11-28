const config = require('../src/config/env');
const { randomUUID } = require('crypto');

function requestContext(req, res, next) {
  const header = config.server.requestIdHeader;
  const requestId = req.headers[header] || randomUUID();
  req.requestId = requestId;
  res.setHeader(header, requestId);
  next();
}

module.exports = requestContext;

