'use strict';

const mongoose = require('mongoose');

const ChildGuardianSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  guardianId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guardian', required: true, immutable: true, index: true },
  relationship: { type: String, enum: ['mother', 'father', 'guardian', 'grandparent', 'other'], required: true },
  isPrimaryContact: { type: Boolean, default: false },
  isBillingContact: { type: Boolean, default: false },
  isEmergencyContact: { type: Boolean, default: false },
  authorizedPickup: { type: Boolean, default: false },
  receivesSchoolUpdates: { type: Boolean, default: true },
  consent: {
    schoolCommunication: { type: String, enum: ['unknown', 'granted', 'withdrawn'], default: 'unknown' },
    photoUse: { type: String, enum: ['unknown', 'granted', 'withdrawn'], default: 'unknown' },
    consentRecordedAt: { type: Date, default: null },
    consentRecordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, strict: 'throw' });

ChildGuardianSchema.index({ organizationId: 1, branchId: 1, childId: 1, guardianId: 1 }, { unique: true });
ChildGuardianSchema.index({ organizationId: 1, branchId: 1, isPrimaryContact: 1 });

module.exports = mongoose.model('ChildGuardian', ChildGuardianSchema);
