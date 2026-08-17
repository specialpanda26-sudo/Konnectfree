const Device = require('../models/Device');
const routerService = require('./router.service');
const logger = require('../utils/logger');

/**
 * Finds devices whose session has passed expiresAt but are still marked
 * 'bound', flips them to 'expired', and asks the router to remove the
 * whitelist entry. This is what src/server.js runs on an interval — it's
 * the piece that was previously missing: without it, a device stays
 * bound forever once whitelisted, even after its paid time is up.
 *
 * Router removal failures are logged but don't block the DB update —
 * we'd rather have an accurate "expired" record and a router that's
 * slightly out of sync (fixable by re-running this) than the reverse.
 */
async function sweepExpiredDevices() {
  const expired = await Device.find({
    status: 'bound',
    expiresAt: { $lte: new Date() },
  }).limit(500);

  if (!expired.length) return { checked: 0, expired: 0 };

  let ok = 0;
  for (const device of expired) {
    try {
      await routerService.unbindDevice({ mac: device.mac });
    } catch (err) {
      logger.warn(`[cleanup] router unbind failed for ${device.mac}:`, err.message);
      // Continue anyway — still mark expired in our own records below.
    }
    device.status = 'expired';
    await device.save();
    ok++;
  }

  logger.info(`[cleanup] swept ${ok}/${expired.length} expired device(s)`);
  return { checked: expired.length, expired: ok };
}

/**
 * Starts the periodic sweep. Returns a handle so callers (e.g. tests,
 * or a graceful-shutdown hook) can clearInterval() it if needed.
 */
function startCleanupJob(intervalMinutes = 5) {
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const handle = setInterval(() => {
    sweepExpiredDevices().catch((err) => {
      logger.error('[cleanup] sweep failed:', err.message);
    });
  }, ms);
  // Don't let this timer keep the process alive on its own if everything
  // else has shut down.
  if (handle.unref) handle.unref();
  logger.info(`[cleanup] expired-device sweep scheduled every ${intervalMinutes}m`);
  return handle;
}

module.exports = { sweepExpiredDevices, startCleanupJob };
