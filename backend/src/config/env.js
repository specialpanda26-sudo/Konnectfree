require('dotenv').config();

const required = [
  'MONGO_URI',
  'JWT_SECRET',
  'INTASEND_PUBLISHABLE_KEY',
  'INTASEND_SECRET_KEY',
  'INTASEND_WEBHOOK_CHALLENGE',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  // Fail fast and loud — never start the server in a half-configured,
  // insecure state (e.g. without a JWT secret or webhook challenge).
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill these in before starting the server.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is too short. Generate one with: openssl rand -hex 64');
  process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGO_URI,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  },
  intasend: {
    publishableKey: process.env.INTASEND_PUBLISHABLE_KEY,
    secretKey: process.env.INTASEND_SECRET_KEY,
    // Note: IntaSend's API gateway (api.intasend.com) serves both sandbox
    // and live traffic — which one you hit is determined by whether
    // INTASEND_SECRET_KEY is a test (ISSecretKey_test_...) or live
    // (ISSecretKey_live_...) key, not by a different base URL. This flag
    // is kept for logging/display purposes only.
    testMode: !!process.env.INTASEND_SECRET_KEY?.includes('_test_'),
    webhookChallenge: process.env.INTASEND_WEBHOOK_CHALLENGE,
  },
  mikrotik: {
    host: process.env.MIKROTIK_HOST,
    apiPort: parseInt(process.env.MIKROTIK_API_PORT, 10) || 8728,
    user: process.env.MIKROTIK_USER,
    password: process.env.MIKROTIK_PASSWORD,
  },
};
