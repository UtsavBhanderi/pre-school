'use strict';

const mongoose = require('mongoose');

const TenantSequenceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true },
  sequenceType: { type: String, enum: ['admission', 'invoice', 'receipt'], required: true, immutable: true },
  year: { type: String, required: true, trim: true, immutable: true },
  value: { type: Number, min: 0, default: 0 },
}, { timestamps: true, strict: 'throw' });

TenantSequenceSchema.index(
  { organizationId: 1, branchId: 1, sequenceType: 1, year: 1 },
  { unique: true }
);

module.exports = mongoose.model('TenantSequence', TenantSequenceSchema);
