'use strict';

const mongoose = require('mongoose');

const GuardianSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  phone: { type: String, required: true, trim: true, maxlength: 24 },
  alternatePhone: { type: String, trim: true, maxlength: 24, default: '' },
  preferredLanguage: { type: String, enum: ['en', 'hi', 'gu'], default: 'en' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  portalUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  emailVerifiedAt: { type: Date, default: null },
  phoneVerifiedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, strict: 'throw' });

GuardianSchema.index({ organizationId: 1, phone: 1 });
GuardianSchema.index({ organizationId: 1, email: 1 });
GuardianSchema.index(
  { organizationId: 1, portalUserId: 1 },
  { unique: true, partialFilterExpression: { portalUserId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('Guardian', GuardianSchema);
