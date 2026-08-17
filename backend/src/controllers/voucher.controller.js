const Voucher = require('../models/Voucher');
const Package = require('../models/Package');
const Customer = require('../models/Customer');
const Device = require('../models/Device');
const routerService = require('../services/router.service');
const generateVoucherCode = require('../utils/generateVoucher');
const normalizePhone = require('../utils/normalizePhone');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

// POST /api/vouchers/activate  (public — customer redeeming a code)
// Body: { code, phone, mac }
const activateVoucher = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').toUpperCase().trim();
  const mac = String(req.body.mac || '').toUpperCase().trim();
  const phone = normalizePhone(req.body.phone);

  if (!code) throw new ApiError(400, 'Voucher code is required');
  if (!MAC_REGEX.test(mac)) throw new ApiError(400, 'Invalid MAC address format');
  if (!phone) throw new ApiError(400, 'Invalid phone number');

  const voucher = await Voucher.findOne({ code });
  if (!voucher) throw new ApiError(404, 'Voucher code not found');
  if (voucher.status === 'used') throw new ApiError(409, 'This voucher has already been used');
  if (voucher.status === 'revoked') throw new ApiError(409, 'This voucher is no longer valid');

  const pkg = await Package.findById(voucher.package);
  if (!pkg) throw new ApiError(500, 'Voucher package no longer exists');

  const customer = await Customer.findOneAndUpdate(
    { phone },
    { phone, name: 'Voucher customer' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const device = await Device.create({
    mac, customer: customer._id, package: pkg._id, status: 'pending',
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
    throw new ApiError(502, 'Voucher accepted but device could not be connected. Contact support.');
  }

  voucher.status = 'used';
  voucher.redeemedBy = customer._id;
  voucher.redeemedMac = mac;
  voucher.redeemedAt = new Date();
  voucher.expiresAt = device.expiresAt;
  await voucher.save();

  res.json({ status: 'bound', expiresAt: device.expiresAt, package: { name: pkg.name, dataLimitLabel: pkg.dataLimitLabel } });
});

// POST /api/admin/vouchers  (admin — generate a batch)
// Body: { packageId, quantity, batchLabel }
const generateVouchers = asyncHandler(async (req, res) => {
  const { packageId, batchLabel } = req.body;
  const quantity = Math.min(parseInt(req.body.quantity, 10) || 1, 500); // hard cap per request

  const pkg = await Package.findById(packageId);
  if (!pkg) throw new ApiError(404, 'Package not found');

  const vouchers = [];
  for (let i = 0; i < quantity; i++) {
    vouchers.push({
      code: generateVoucherCode(),
      package: pkg._id,
      createdBy: req.admin.id,
      batchLabel: batchLabel || undefined,
    });
  }
  const created = await Voucher.insertMany(vouchers);
  res.status(201).json({ vouchers: created.map((v) => v.code) });
});

// GET /api/admin/vouchers  (admin — list/search)
const listVouchers = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const vouchers = await Voucher.find(filter).sort({ createdAt: -1 }).limit(500).populate('package', 'name priceKsh');
  res.json({ vouchers });
});

// PATCH /api/admin/vouchers/:id/revoke  (admin — deactivate an unused voucher)
// Only 'unused' vouchers can be revoked — one that's already been
// redeemed has already granted access, so revoking it wouldn't undo
// that, it would just corrupt the audit trail.
const revokeVoucher = asyncHandler(async (req, res) => {
  const voucher = await Voucher.findById(req.params.id);
  if (!voucher) throw new ApiError(404, 'Voucher not found');
  if (voucher.status !== 'unused') {
    throw new ApiError(409, `Cannot revoke a voucher with status "${voucher.status}"`);
  }
  voucher.status = 'revoked';
  await voucher.save();
  res.json({ voucher });
});

module.exports = { activateVoucher, generateVouchers, listVouchers, revokeVoucher };
