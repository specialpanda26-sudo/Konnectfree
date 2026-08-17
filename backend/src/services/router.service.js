const { RouterOSAPI } = require('node-routeros');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * ---------------------------------------------------------------
 * ROUTER / MIKROTIK INTEGRATION
 * ---------------------------------------------------------------
 * Talks to RouterOS's binary API (port 8728, or 8729 for TLS) to
 * whitelist/remove devices from /ip/hotspot/ip-binding with
 * type=bypassed — that's what lets a device skip the hotspot login
 * splash once it's paid, without MikroTik needing its own idea of
 * "expiry" (this app's cleanup.service handles expiry and calls
 * unbindDevice()).
 *
 * If MIKROTIK_HOST/USER/PASSWORD aren't set, both functions run in
 * "simulated" mode so the rest of the app (payments, vouchers, the
 * admin dashboard) is fully testable before a router is wired up.
 * Flip real mode on by setting those three env vars.
 * ---------------------------------------------------------------
 */

const isConfigured = () => !!(env.mikrotik.host && env.mikrotik.user && env.mikrotik.password);

// Every call opens a short-lived connection and closes it — hotspot
// bind/unbind calls are low-frequency (one per payment, one per
// expiry), so a persistent connection isn't worth the complexity of
// keeping it alive across reconnects/idle timeouts.
async function withConnection(fn) {
  const conn = new RouterOSAPI({
    host: env.mikrotik.host,
    user: env.mikrotik.user,
    password: env.mikrotik.password,
    port: env.mikrotik.apiPort,
    timeout: 8, // seconds — fail fast rather than hang a payment webhook
  });
  try {
    await conn.connect();
    return await fn(conn);
  } finally {
    // conn.close() can itself throw if the socket already dropped;
    // never let that mask the real result/error from fn().
    try { await conn.close(); } catch (_) { /* already closed */ }
  }
}

async function findBindingId(conn, mac) {
  const rows = await conn.write('/ip/hotspot/ip-binding/print', [`?mac-address=${mac}`]);
  return rows[0]?.['.id'] || null;
}

async function bindDevice({ mac, durationHours }) {
  if (!isConfigured()) {
    logger.warn(`[router] MikroTik not configured — simulating bind for ${mac}. Set MIKROTIK_HOST/USER/PASSWORD to go live.`);
    return { ok: true, simulated: true };
  }

  return withConnection(async (conn) => {
    const existingId = await findBindingId(conn, mac);
    const comment = `konnect-free · ${durationHours}h · ${new Date().toISOString()}`;

    if (existingId) {
      // Device paid again (e.g. renewal before old binding expired) —
      // refresh the comment/timestamp rather than creating a duplicate
      // entry, which RouterOS would otherwise happily accept.
      await conn.write('/ip/hotspot/ip-binding/set', [
        `=.id=${existingId}`,
        '=type=bypassed',
        `=comment=${comment}`,
      ]);
      logger.info(`[router] refreshed existing binding for ${mac}`);
      return { ok: true, refreshed: true };
    }

    await conn.write('/ip/hotspot/ip-binding/add', [
      `=mac-address=${mac}`,
      '=type=bypassed',
      `=comment=${comment}`,
    ]);
    logger.info(`[router] bound ${mac} for ${durationHours}h`);
    return { ok: true };
  }).catch((err) => {
    logger.error(`[router] bindDevice failed for ${mac}:`, err.message);
    throw new Error(`RouterOS bind failed: ${err.message}`);
  });
}

async function unbindDevice({ mac }) {
  if (!isConfigured()) {
    return { ok: true, simulated: true };
  }

  return withConnection(async (conn) => {
    const existingId = await findBindingId(conn, mac);
    if (!existingId) {
      // Already gone (manually removed, or router was reset) — not an
      // error from this app's point of view, the end state is correct.
      return { ok: true, alreadyAbsent: true };
    }
    await conn.write('/ip/hotspot/ip-binding/remove', [`=.id=${existingId}`]);
    logger.info(`[router] unbound ${mac}`);
    return { ok: true };
  }).catch((err) => {
    logger.error(`[router] unbindDevice failed for ${mac}:`, err.message);
    throw new Error(`RouterOS unbind failed: ${err.message}`);
  });
}

/**
 * Optional health check for the admin dashboard — confirms the app can
 * actually reach and authenticate to the router right now, separate
 * from any individual bind/unbind call.
 */
async function pingRouter() {
  if (!isConfigured()) return { ok: false, simulated: true, reason: 'Not configured' };
  try {
    await withConnection(async (conn) => {
      await conn.write('/system/identity/print');
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { bindDevice, unbindDevice, pingRouter };
