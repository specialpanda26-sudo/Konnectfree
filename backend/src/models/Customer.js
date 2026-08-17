const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  // normalized 2547XXXXXXXX — unique because every upsert path
  // (stk-push, voucher redeem, mpesa-review approval) and the
  // reconnect lookup treat phone as the customer's identity key.
  // Without a unique index, two near-simultaneous requests from the
  // same number can both miss each other's findOneAndUpdate upsert
  // and create duplicate Customer docs.
  phone: { type: String, required: true, unique: true },
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
