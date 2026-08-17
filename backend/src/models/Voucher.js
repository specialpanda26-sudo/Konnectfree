const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, index: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  status: { type: String, enum: ['unused', 'active', 'used', 'revoked'], default: 'unused', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  redeemedMac: { type: String, uppercase: true },
  redeemedAt: { type: Date },
  expiresAt: { type: Date }, // session expiry once redeemed
  batchLabel: { type: String }, // optional: group vouchers printed together
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);
