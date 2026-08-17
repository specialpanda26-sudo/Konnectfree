const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiters');

const publicRoutes = require('./routes/public.routes');
const webhookRoutes = require('./routes/webhook.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

const crypto = require('crypto');
const fs = require('fs');

const app = express();

// Behind a reverse proxy (nginx/Render/Railway etc.) — needed for
// correct client IPs in rate limiting and secure cookies.
app.set('trust proxy', 1);

// Per-request CSP nonce, used for the frontend's single inline <script>
// and <style> block instead of blanket 'unsafe-inline'. Set before
// helmet so the CSP directives below can read it off res.locals.
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      // Both the portal and admin pages link a Google Fonts stylesheet,
      // which itself references .woff2 files from fonts.gstatic.com —
      // those need font-src, not style-src.
      styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      // The portal only ever links out to tel: (support call) and the
      // WhatsApp-style support chat inside its own overlay, not iframes.
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));

app.use(cors({
  origin(origin, callback) {
    // Allow no-origin requests (curl, server-to-server, IntaSend webhooks)
    // but restrict browser requests to the configured allowlist.
    if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '100kb' })); // small limit — this API never needs large bodies
app.use(mongoSanitize()); // strips $/. operators from req.body/query/params — blocks NoSQL injection
app.use(hpp()); // blocks HTTP parameter pollution (?mac=A&mac=B tricks)
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ ok: true, env: env.nodeEnv }));

app.use('/api', publicRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

/*
 * ---------------------------------------------------------------
 * FRONTEND — konnect-free.html is served as a static asset from
 * this same app/origin (one deployable, one URL). It's a single
 * inline <script> + <style> file, so instead of `express.static`
 * serving it verbatim, we read it, stamp today's CSP nonce onto
 * those two tags, and send it. Everything else in /public (none
 * yet, but e.g. a future /public/favicon.ico) is served normally.
 * `index: false` stops express.static from also auto-serving the
 * un-nonced index.html and racing with the handler below.
 * ---------------------------------------------------------------
 */
const publicDir = path.join(__dirname, '..', 'public');
const indexPath = path.join(publicDir, 'index.html');
let indexHtmlCache = null; // cached at boot; the file doesn't change at runtime

app.use(express.static(publicDir, { index: false }));

app.get('/', (req, res, next) => {
  if (indexHtmlCache === null) {
    try {
      indexHtmlCache = fs.readFileSync(indexPath, 'utf8');
    } catch (err) {
      return next(err);
    }
  }
  const withNonce = indexHtmlCache
    .replace('<script>', `<script nonce="${res.locals.cspNonce}">`)
    .replace('<style>', `<style nonce="${res.locals.cspNonce}">`);
  res.type('html').send(withNonce);
});

/*
 * ---------------------------------------------------------------
 * ADMIN PANEL — same pattern as the customer portal above: served
 * from this same app at /admin so there's no separate host/build
 * step. It calls same-origin '/api/admin/...' by default (see
 * admin/index.html's API_BASE), but can still be pointed at a
 * different backend by setting window.KONNECT_API_BASE before this
 * script runs, e.g. if you ever want to host it standalone.
 * ---------------------------------------------------------------
 */
const adminDir = path.join(__dirname, '..', 'admin');
const adminIndexPath = path.join(adminDir, 'index.html');
let adminHtmlCache = null;

app.use('/admin', express.static(adminDir, { index: false }));

app.get('/admin', (req, res, next) => {
  if (adminHtmlCache === null) {
    try {
      adminHtmlCache = fs.readFileSync(adminIndexPath, 'utf8');
    } catch (err) {
      return next(err);
    }
  }
  const withNonce = adminHtmlCache
    .replace('<script>', `<script nonce="${res.locals.cspNonce}">`)
    .replace('<style>', `<style nonce="${res.locals.cspNonce}">`);
  res.type('html').send(withNonce);
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
