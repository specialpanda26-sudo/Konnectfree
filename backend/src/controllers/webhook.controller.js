const Payment = require('../models/Payment');
const Device = require('../models/Device');
const Package = require('../models/Package');
const intasend = require('../services/intasend.service');
const routerService = require('../services/router.service');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// POST /api/webhooks/intasend
// IntaSend calls this URL when a payment's status changes. This is the
// ONLY place a payment is ever marked "paid" — never trust a client's
// own claim that they paid.
const intasendWebhook = asyncHandler(async (req, res) => {
  // 1. Verify this really came from IntaSend before touching anything.
  if (!intasend.verifyWebhookSignature(req)) {
    logger.warn('[webhook] rejected — invalid or missing signature');
    throw new ApiError(401, 'Invalid webhook signature');
  }

  const body = req.body;
  // Confirmed field names from IntaSend's OpenAPI spec (InvoicesSer) and
  // published webhook payload example — no more guessing here.
  const invoiceId = body.invoice_id;
  const state = (body.state || '').toUpperCase();
  const mpesaCode = body.mpesa_reference || null;

  if (!invoiceId) throw new ApiError(400, 'Missing invoice id in webhook payload');

  const payment = await Payment.findOne({ invoiceId });
  if (!payment) {
    logger.warn(`[webhook] payment not found for invoice ${invoiceId}`);
    return res.status(200).json({ received: true }); // ack anyway — nothing to retry
  }

  // 2. Idempotency — if we've already processed this payment (e.g.
  // IntaSend retried the webhook), do nothing. This is what stops a
  // device being double-billed-credited or the router call firing twice.
  if (payment.processedAt) {
    return res.status(200).json({ received: true, alreadyProcessed: true });
  }

  payment.rawWebhookMeta = body;

  if (state === 'COMPLETE') {
    payment.status = 'paid';
    payment.mpesaCode = mpesaCode;
    payment.processedAt = new Date();
    await payment.save();

    const pkg = await Package.findById(payment.package);

    // Renewal case: this MAC may already have a live 'bound' Device from
    // an earlier purchase. router.service.bindDevice() below correctly
    // refreshes the MikroTik binding in place, but if we don't also
    // close out the old DB row here, we'd end up with two 'bound'
    // Device docs for the same MAC — inflating the admin activeDevices
    // count until the old one naturally expires.
    await Device.updateMany(
      { mac: payment.mac, status: 'bound' },
      { $set: { status: 'expired' } }
    );

    const device = await Device.create({
      mac: payment.mac,
      customer: payment.customer,
      package: payment.package,
      payment: payment._id,
      status: 'pending',
    });

    try {
      await routerService.bindDevice({ mac: payment.mac, durationHours: pkg.durationHours });
      device.status = 'bound';
      device.boundAt = new Date();
      device.expiresAt = new Date(Date.now() + pkg.durationHours * 60 * 60 * 1000);
    } catch (err) {
      logger.error(`[webhook] router bind failed for ${payment.mac}:`, err.message);
      device.status = 'failed';
      device.routerNote = err.message;
      // Payment stays 'paid' — money was taken. This case needs a
      // human (admin dashboard should surface status:'failed' devices
      // prominently) or an automatic retry job.
    }
    await device.save();
  } else if (state === 'FAILED' || state === 'CANCELED') {
    // Note: IntaSend's enum uses the single-L American spelling "CANCELED".
    payment.status = state === 'FAILED' ? 'failed' : 'cancelled';
    payment.processedAt = new Date();
    await payment.save();
  }
  // PENDING / PROCESSING / PARTIAL / RETRY — payment isn't resolved yet,
  // no action taken; IntaSend will call again when the state changes.

  res.status(200).json({ received: true });
});

module.exports = { intasendWebhook };
