const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username: String(username).toLowerCase().trim() });

  // Same generic error whether the username doesn't exist or the
  // password is wrong — don't let an attacker enumerate usernames.
  const genericError = () => { throw new ApiError(401, 'Invalid username or password'); };

  if (!admin) return genericError();

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    throw new ApiError(423, 'Account temporarily locked due to repeated failed logins. Try again later.');
  }

  const valid = await admin.checkPassword(password);
  if (!valid) {
    admin.failedLoginAttempts += 1;
    if (admin.failedLoginAttempts >= LOCKOUT_THRESHOLD) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      admin.failedLoginAttempts = 0;
    }
    await admin.save();
    return genericError();
  }

  admin.failedLoginAttempts = 0;
  admin.lockedUntil = undefined;
  await admin.save();

  const token = jwt.sign(
    { id: admin._id, username: admin.username, role: admin.role },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  res.json({ token, admin: { username: admin.username, role: admin.role } });
});

module.exports = { login };
