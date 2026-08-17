const { v4: uuidv4 } = require('uuid');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Package = require('../models/Package');
const Device = require('../models/Device');
const intasend = require('../services/intasend.service');
const normalizePhone = require('../utils/normalizePhone');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const MAC_REGEX = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/;

// POST /api/stk-push
// Body: { name, phone, mac, packageId }
const startStkPush = asyncHandler(async (req, res) => {
  const { name, packageId } = req.body;
  const mac = String(req.body.mac || '').toUpperCase().trim();
  const phone = normalizePhone(req.body.phone);

  if (!MAC_REGEX.test(mac)) throw new ApiError(400, 'Invalid MAC address format');
  if (!phone) throw new ApiError(400, 'Invalid phone number');

  // Price comes from the DB, never from the request body — the
  // frontend can only choose WHICH package, never how much it costs.
  const pkg = await Package.findOne({ _id: packageId, active: true });
  if (!pkg) throw new ApiError(404, 'Package not found');

  const customer = await Customer.findOneAndUpdate(
    { phone },
    { name: name?.trim().slice(0, 100) || 'Customer', phone },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const apiRef = uuidv4();

  let stk;
  try {
    stk = await intasend.initiateStkPush({
      phone,
      amountKsh: pkg.priceKsh,
      apiRef,
    });
  } catch (err) {
    logger.error('IntaSend STK push failed:', err.response?.data || err.message);
    throw new ApiError(502, 'Could not start M-Pesa payment. Please try again.');
  }

  const payment = await Payment.create({
    invoiceId: stk.invoiceId || apiRef,
    customer: customer._id,
    package: pkg._id,
    mac,
    amountKsh: pkg.priceKsh,
    phone,
    status: 'pending',
  });

  res.status(201).json({ invoiceId: payment.invoiceId });
});

// GET /api/stk-status/:invoiceId — polled by the frontend
const getPaymentStatus = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ invoiceId: req.params.invoiceId });
  if (!payment) throw new ApiError(404, 'Payment not found');
  res.json({ status: payment.status, mpesaCode: payment.mpesaCode || null });
});

// GET /api/device-status/:mac — polled by the frontend during the
// "Connecting you to Starlink…" screen
const getDeviceStatus = asyncHandler(async (req, res) => {
  const mac = String(req.params.mac || '').toUpperCase();
  const device = await Device.findOne({ mac }).sort({ createdAt: -1 });
  if (!device) return res.json({ status: 'pending' });
  res.json({ status: device.status, expiresAt: device.expiresAt || null });
});

module.exports = { startStkPush, getPaymentStatus, getDeviceStatus };
