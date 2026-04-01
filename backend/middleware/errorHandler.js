'use strict';

/**
 * Centralised error handler middleware.
 * Must be the last middleware registered with app.use().
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error('[Error]', err.message, err.stack);

  const status = err.status || err.statusCode || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  res.status(status).json({ success: false, error: message });
}

/**
 * Wrap async route handlers so thrown errors reach errorHandler.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, asyncHandler };
