const mongoose = require('mongoose');

// Holds M-Pesa confirmation messages a customer pasted in that couldn't
// be auto-matched to a webhook-confirmed Payment (see
// deviceController.verifyMpesaMessage). Deliberately NEVER auto-credits
// a device — this only exists so an admin can look at it, verify it
// against the actual M-Pesa till/paybill statement, and manually
// approve (which binds the device) or reject it.
const mpesaReviewSchema = new mongoose.Schema({
  message: { type: String, required: true, maxlength: 2000 },
  extractedCode: { type: String }, // best-guess M-Pesa transaction code, if the regex found one
  extractedAmountKsh: { type: Number },
  phone: { type: String }, // optional — whatever the customer had entered, not normalized/verified
  mac: { type: String, uppercase: true, trim: true }, // routerMac at time of submission, if available
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  resolvedAt: { type: Date },
  resolutionNote: { type: String, maxlength: 500 },
  device: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' }, // set if approved and a device was bound
}, { timestamps: true });

module.exports = mongoose.model('MpesaReview', mpesaReviewSchema);
