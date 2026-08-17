const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { ApiError } = require('./errorHandler');

// Protects admin routes. Expects: Authorization: Bearer <token>
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Missing or malformed authorization header'));
  }
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.admin = payload; // { id, username, role }
    next();
  } catch (err) {
    next(new ApiError(401, 'Invalid or expired session'));
  }
}

// Restricts a route to owner-role admins (e.g. creating other admin accounts).
function requireOwner(req, res, next) {
  if (!req.admin || req.admin.role !== 'owner') {
    return next(new ApiError(403, 'Owner access required'));
  }
  next();
}

module.exports = { requireAdmin, requireOwner };
