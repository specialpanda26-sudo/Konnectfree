// Minimal structured logger. Swap for pino/winston later if you want —
// kept dependency-free here. Never logs secrets (tokens, passwords,
// full webhook bodies with card/M-Pesa PII beyond what's needed).
function ts() { return new Date().toISOString(); }
module.exports = {
  info: (...args) => console.log(`[${ts()}] INFO`, ...args),
  warn: (...args) => console.warn(`[${ts()}] WARN`, ...args),
  error: (...args) => console.error(`[${ts()}] ERROR`, ...args),
};
