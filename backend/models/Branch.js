'use strict';

const mongoose = require('mongoose');

const BranchSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, immutable: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  code: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 16, match: /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/ },
  status: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active', index: true },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  address: {
    line1: { type: String, trim: true, maxlength: 160, default: '' },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    postalCode: { type: String, trim: true, maxlength: 20, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
  },
  timezone: { type: String, trim: true, default: 'Asia/Kolkata' },
  openedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' });

BranchSchema.index({ organizationId: 1, code: 1 }, { unique: true });
BranchSchema.index({ organizationId: 1, status: 1, name: 1 });

module.exports = mongoose.model('Branch', BranchSchema);
