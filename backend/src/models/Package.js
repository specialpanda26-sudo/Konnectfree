const mongoose = require('mongoose');

// Packages live in the DB (not hardcoded) so prices/data can change
// without a redeploy, and so the frontend and backend can never drift —
// the client sends a packageId, the server looks up the real price itself.
// NEVER trust a price sent from the browser.
const packageSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true }, // e.g. 'daily'
  name: { type: String, required: true },
  dataLimitLabel: { type: String, required: true }, // '10GB', 'Unlimited'
  periodLabel: { type: String, required: true }, // '24 Hours'
  durationHours: { type: Number, required: true }, // used to compute expiry
  priceKsh: { type: Number, required: true, min: 1 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Package', packageSchema);
