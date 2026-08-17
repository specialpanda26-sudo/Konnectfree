const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, index: true }, // normalized 2547XXXXXXXX
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
