const logger = require('../utils/logger');
const env = require('../config/env');

// Central error handler. In production this never leaks stack traces,
// raw DB errors, or internal file paths to the client — those go to
// the server log only.
function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  logger.error(err.message, env.nodeEnv === 'development' ? err.stack : '');

  const body = { error: status === 500 ? 'Internal server error' : err.message };
  if (env.nodeEnv === 'development') body.stack = err.stack;
  res.status(status).json(body);
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { notFound, errorHandler, ApiError };
