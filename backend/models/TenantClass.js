'use strict';

const mongoose = require('mongoose');

const TenantClassSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80, immutable: true },
  code: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 16, match: /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, immutable: true },
  minAgeMonths: { type: Number, min: 0, max: 240, default: null },
  maxAgeMonths: { type: Number, min: 0, max: 240, default: null },
  defaultFeePaise: { type: Number, min: 0, max: 100000000000, default: 0 },
  enrollmentVersion: { type: Number, min: 0, default: 0 },
  feeFrequency: { type: String, enum: ['annual', 'term', 'monthly', 'one_time'], default: 'annual' },
  capacity: { type: Number, min: 1, max: 1000, default: 30 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, strict: 'throw' });

TenantClassSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: true });
TenantClassSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: true });
TenantClassSchema.index({ organizationId: 1, branchId: 1, status: 1, name: 1 });

module.exports = mongoose.model('TenantClass', TenantClassSchema);
