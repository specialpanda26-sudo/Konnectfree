const rateLimit = require('express-rate-limit');

// Tuned per-route: payment/login endpoints are the ones actually worth
// protecting (money + credential guessing). General browsing traffic
// gets a looser global limit.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const stkPushLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5, // 5 STK pushes per IP per 10 min — enough for retries, not for abuse/spam-dialing someone's phone
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment attempts. Please wait a few minutes and try again.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait before trying again.' },
});

const voucherLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, stkPushLimiter, loginLimiter, voucherLimiter };
