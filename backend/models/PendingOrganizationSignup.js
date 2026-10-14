'use strict';

const mongoose = require('mongoose');

const PendingOrganizationSignupSchema = new mongoose.Schema({
  organizationName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  organizationSlugBase: { type: String, required: true, trim: true, lowercase: true, maxlength: 100 },
  branchName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  branchCode: { type: String, required: true, trim: true, uppercase: true, minlength: 2, maxlength: 16 },
  username: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  timezone: { type: String, required: true, trim: true, default: 'Asia/Kolkata' },
  tokenHash: { type: String, required: true, unique: true, select: false },
  status: { type: String, enum: ['pending', 'completed', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

PendingOrganizationSignupSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);
PendingOrganizationSignupSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('PendingOrganizationSignup', PendingOrganizationSignupSchema);
