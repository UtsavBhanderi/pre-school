'use strict';

const mongoose = require('mongoose');

const TenantStaffProfileSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  legacySourceTeacherId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true, index: true },
  employeeCode: { type: String, trim: true, maxlength: 80, default: '' },
  firstName: { type: String, trim: true, maxlength: 80, required: true },
  middleName: { type: String, trim: true, maxlength: 80, default: '' },
  lastName: { type: String, trim: true, maxlength: 80, default: '' },
  displayName: { type: String, trim: true, maxlength: 160, required: true },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, trim: true, maxlength: 30, default: '' },
  gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  dateOfBirth: { type: String, trim: true, maxlength: 40, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  importedFromLegacy: { type: Boolean, default: false, immutable: true },
  importedAt: { type: Date, default: null, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, strict: 'throw' });

TenantStaffProfileSchema.index({ organizationId: 1, branchId: 1, userId: 1 }, { unique: true });
TenantStaffProfileSchema.index(
  { organizationId: 1, branchId: 1, legacySourceTeacherId: 1 },
  { unique: true, partialFilterExpression: { legacySourceTeacherId: { $type: 'objectId' } } }
);
TenantStaffProfileSchema.index({ organizationId: 1, branchId: 1, status: 1, displayName: 1 });

module.exports = mongoose.model('TenantStaffProfile', TenantStaffProfileSchema);
