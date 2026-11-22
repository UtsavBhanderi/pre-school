'use strict';

const mongoose = require('mongoose');

const FeeReceiptCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, min: 0, default: 0 },
}, { versionKey: false });

module.exports = mongoose.models.FeeReceiptCounter || mongoose.model('FeeReceiptCounter', FeeReceiptCounterSchema);
