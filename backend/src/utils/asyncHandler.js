// Wraps an async route handler so thrown errors/rejected promises reach
// the centralized error handler instead of crashing the process or
// hanging the request.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
