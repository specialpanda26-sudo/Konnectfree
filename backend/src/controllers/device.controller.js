const Device = require('../models/Device');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Voucher = require('../models/Voucher');
const MpesaReview = require('../models/MpesaReview');
const normalizePhone = require('../utils/normalizePhone');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

// Vouchers are generated as two 5-char groups joined by a dash (see
// utils/generateVoucher.js), but customers may type/paste them without
// the dash, with extra spaces, or in lowercase. Normalize to the exact
// stored format (AAAAA-BBBBB) before querying, or return null if the
// input clearly isn't a 10-character voucher code.
function normalizeVoucherCode(raw) {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 10) return null;
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
}

// POST /api/reconnect  (public)
// Body: { identifier }  — phone number or voucher code
const reconnect = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  if (!identifier) throw new ApiError(400, 'Enter a phone number or voucher code');

  let device;

  const phone = normalizePhone(identifier);
  if (phone) {
    const customer = await Customer.findOne({ phone });
    if (customer) {
      device = await Device.findOne({ customer: customer._id, status: 'bound' }).sort({ createdAt: -1 });
    }
  }

  // Not a phone number (or no device found for it) — try it as a
  // voucher code. Redeemed vouchers don't carry their own device
  // reference, but they do record the MAC they were redeemed onto,
  // which is enough to find the device that binding created.
  if (!device) {
    const code = normalizeVoucherCode(identifier);
    if (code) {
      const voucher = await Voucher.findOne({ code, status: 'used' });
      if (voucher && voucher.redeemedMac) {
        device = await Device.findOne({ mac: voucher.redeemedMac, status: 'bound' }).sort({ createdAt: -1 });
      }
    }
  }

  if (!device) throw new ApiError(404, 'No active package found for that phone number or code');
  if (device.expiresAt && device.expiresAt < new Date()) {
    throw new ApiError(410, 'Your package has expired. Please buy a new one.');
  }

  res.json({ status: device.status, mac: device.mac, expiresAt: device.expiresAt });
});

// POST /api/verify-mpesa-message  (public)
// Body: { message, phone?, mac? }  — manual fallback when a webhook was
// missed. Deliberately conservative: this only queues the payment for
// admin review, it never auto-credits a device from free-text SMS
// content (that text is trivially fakeable by the customer). The
// review itself is persisted (MpesaReview) so "queued for review" is
// an actual admin-visible queue, not just a reassuring string.
const verifyMpesaMessage = asyncHandler(async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (message.length < 15) throw new ApiError(400, 'Paste the full M-Pesa confirmation message');

  const codeMatch = message.match(/\b[A-Z0-9]{10}\b/); // typical M-Pesa code shape
  const amountMatch = message.match(/Ksh\s?([\d,]+(?:\.\d{2})?)/i);

  const payment = codeMatch
    ? await Payment.findOne({ mpesaCode: codeMatch[0] })
    : null;

  if (payment && payment.status === 'paid') {
    return res.json({ status: 'already_verified', message: 'This payment is already confirmed. If you still have no internet, contact support.' });
  }

  const review = await MpesaReview.create({
    message,
    extractedCode: codeMatch ? codeMatch[0] : undefined,
    extractedAmountKsh: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : undefined,
    phone: req.body.phone ? String(req.body.phone).trim().slice(0, 30) : undefined,
    mac: req.body.mac ? String(req.body.mac).trim().slice(0, 30) : undefined,
  });

  res.json({
    status: 'queued_for_review',
    reviewId: review._id,
    message: "We couldn't auto-match this message. Support will verify it manually shortly.",
  });
});

module.exports = { reconnect, verifyMpesaMessage };
