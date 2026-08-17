const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true, unique: true, index: true }, // IntaSend invoice/tracking id
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  package: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true },
  mac: { type: String, required: true, uppercase: true, trim: true },
  amountKsh: { type: Number, required: true },
  phone: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },
  mpesaCode: { type: String },
  // Guards against a webhook (or a retried one) crediting the same
  // payment twice — checked before any device-binding side effect runs.
  processedAt: { type: Date },
  rawWebhookMeta: { type: mongoose.Schema.Types.Mixed }, // last webhook payload, for support/debugging
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
