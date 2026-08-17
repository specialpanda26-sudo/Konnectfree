const mongoose = require('mongoose');

// One active session per device — the "one device per package" rule
// from the frontend is enforced here, not just in the UI copy.
const deviceSchema = new mongoose.Schema({
  mac: { type: String, required: true, uppercase: true, trim: true, index: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package' },
  payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  status: { type: String, enum: ['pending', 'bound', 'expired', 'failed'], default: 'pending', index: true },
  boundAt: { type: Date },
  expiresAt: { type: Date, index: true },
  routerNote: { type: String }, // e.g. error detail from the MikroTik call
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
