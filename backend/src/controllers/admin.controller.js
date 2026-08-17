const Device = require('../models/Device');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Package = require('../models/Package');
const MpesaReview = require('../models/MpesaReview');
const routerService = require('../services/router.service');
const normalizePhone = require('../utils/normalizePhone');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

// GET /api/admin/stats
const getStats = asyncHandler(async (req, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [activeDevices, revenue24h, paymentsToday, totalCustomers] = await Promise.all([
    Device.countDocuments({ status: 'bound', expiresAt: { $gt: new Date() } }),
    Payment.aggregate([
      { $match: { status: 'paid', createdAt: { $gte: since24h } } },
      { $group: { _id: null, total: { $sum: '$amountKsh' } } },
    ]),
    Payment.countDocuments({ status: 'paid', createdAt: { $gte: since24h } }),
    Customer.countDocuments(),
  ]);

  res.json({
    activeDevices,
    revenue24hKsh: revenue24h[0]?.total || 0,
    paymentsToday,
    totalCustomers,
  });
});

// GET /api/admin/router-status — is the app actually able to reach
// the MikroTik router right now? Surfaced on the dashboard so a
// down router shows up before customers start reporting no internet.
const getRouterStatus = asyncHandler(async (req, res) => {
  const status = await routerService.pingRouter();
  res.json(status);
});

// GET /api/admin/devices?status=failed — devices whose payment went
// through but the router bind failed (see webhook.controller.js).
// These need a human: either retry the bind or refund the customer.
const listFailedDevices = asyncHandler(async (req, res) => {
  const devices = await Device.find({ status: 'failed' })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('customer', 'name phone')
    .populate('package', 'name priceKsh');
  res.json({ devices });
});

// POST /api/admin/devices/:id/retry-bind — retry a failed router bind
// without making the customer pay again.
const retryDeviceBind = asyncHandler(async (req, res) => {
  const device = await Device.findById(req.params.id).populate('package');
  if (!device) throw new ApiError(404, 'Device not found');
  if (device.status !== 'failed') {
    throw new ApiError(409, `Device status is "${device.status}", not "failed"`);
  }
  await routerService.bindDevice({ mac: device.mac, durationHours: device.package.durationHours });
  device.status = 'bound';
  device.boundAt = new Date();
  device.expiresAt = new Date(Date.now() + device.package.durationHours * 60 * 60 * 1000);
  device.routerNote = undefined;
  await device.save();
  res.json({ device });
});

// GET /api/admin/devices?status=bound
const listDevices = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const devices = await Device.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('customer', 'name phone')
    .populate('package', 'name priceKsh');
  res.json({ devices });
});

// GET /api/admin/payments
const listPayments = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const payments = await Payment.find(filter)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('customer', 'name phone')
    .populate('package', 'name priceKsh');
  res.json({ payments });
});

// GET /api/admin/mpesa-reviews?status=pending
// The queue behind "we couldn't auto-match this message, support will
// verify it manually" — see deviceController.verifyMpesaMessage.
const listMpesaReviews = asyncHandler(async (req, res) => {
  const { status = 'pending' } = req.query;
  const filter = status === 'all' ? {} : { status };
  const reviews = await MpesaReview.find(filter).sort({ createdAt: -1 }).limit(300);
  res.json({ reviews });
});

// POST /api/admin/mpesa-reviews/:id/approve
// Body: { packageId }  — admin has checked the real M-Pesa statement
// and confirmed this message is genuine. Requires a MAC on the review
// (captured client-side when the message was submitted) since without
// one there's no device to bind — those cases have to be resolved by
// asking the customer to resubmit from the hotspot page, then rejected
// here with a note.
const approveMpesaReview = asyncHandler(async (req, res) => {
  const review = await MpesaReview.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  if (review.status !== 'pending') throw new ApiError(409, `Review already ${review.status}`);

  const mac = String(review.mac || '').toUpperCase().trim();
  if (!MAC_REGEX.test(mac)) {
    throw new ApiError(400, 'This review has no valid MAC address on file — ask the customer to resubmit the message from the WiFi sign-in page, then reject this entry.');
  }

  const pkg = await Package.findById(req.body.packageId);
  if (!pkg) throw new ApiError(404, 'Package not found');

  // Amount sanity check — the admin picks the package, but if the
  // amount extracted from the pasted message doesn't match that
  // package's price, this is very likely the wrong package selected
  // (or a fabricated message) rather than a real mismatch to ignore.
  // req.body.force lets the admin proceed anyway after reviewing —
  // e.g. if the customer paid via a promo price change we haven't
  // updated the package for yet.
  if (
    review.extractedAmountKsh &&
    review.extractedAmountKsh !== pkg.priceKsh &&
    !req.body.force
  ) {
    throw new ApiError(
      409,
      `Amount mismatch: the message says KSh ${review.extractedAmountKsh} but ${pkg.name} costs KSh ${pkg.priceKsh}. Double-check the package, or resend with force:true if this is expected.`
    );
  }

  const phone = normalizePhone(review.phone || '') || undefined;
  let customer = null;
  if (phone) {
    customer = await Customer.findOneAndUpdate(
      { phone },
      { phone, name: 'M-Pesa message customer' },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const device = await Device.create({
    mac,
    customer: customer?._id,
    package: pkg._id,
    status: 'pending',
  });

  try {
    await routerService.bindDevice({ mac, durationHours: pkg.durationHours });
    device.status = 'bound';
    device.boundAt = new Date();
    device.expiresAt = new Date(Date.now() + pkg.durationHours * 60 * 60 * 1000);
    await device.save();
  } catch (err) {
    device.status = 'failed';
    device.routerNote = err.message;
    await device.save();
    throw new ApiError(502, `Device record created but router bind failed: ${err.message}. It will show up in the failed-devices queue.`);
  }

  review.status = 'approved';
  review.resolvedBy = req.admin.id;
  review.resolvedAt = new Date();
  review.device = device._id;
  await review.save();

  res.json({ review, device });
});

// POST /api/admin/mpesa-reviews/:id/reject
// Body: { note }
const rejectMpesaReview = asyncHandler(async (req, res) => {
  const review = await MpesaReview.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found');
  if (review.status !== 'pending') throw new ApiError(409, `Review already ${review.status}`);

  review.status = 'rejected';
  review.resolvedBy = req.admin.id;
  review.resolvedAt = new Date();
  review.resolutionNote = req.body.note ? String(req.body.note).slice(0, 500) : undefined;
  await review.save();

  res.json({ review });
});

module.exports = {
  getStats,
  getRouterStatus,
  listDevices,
  listFailedDevices,
  retryDeviceBind,
  listPayments,
  listMpesaReviews,
  approveMpesaReview,
  rejectMpesaReview,
};
