'use strict';

const mongoose = require('mongoose');

const OrganizationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    maxlength: 140,
  },
  status: { type: String, enum: ['active', 'suspended', 'closing'], default: 'active', index: true },
  timezone: { type: String, required: true, default: 'Asia/Kolkata', trim: true },
  locale: { type: String, required: true, default: 'en-IN', trim: true },
  currency: { type: String, required: true, default: 'INR', uppercase: true, minlength: 3, maxlength: 3 },
  contact: {
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    website: { type: String, trim: true, maxlength: 300, default: '' },
    address: {
      line1: { type: String, trim: true, maxlength: 160, default: '' },
      line2: { type: String, trim: true, maxlength: 160, default: '' },
      city: { type: String, trim: true, maxlength: 100, default: '' },
      state: { type: String, trim: true, maxlength: 100, default: '' },
      postalCode: { type: String, trim: true, maxlength: 20, default: '' },
      country: { type: String, trim: true, maxlength: 100, default: 'India' },
    },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  onboardingCompletedAt: { type: Date, default: null },
  subscription: {
    plan: { type: String, enum: ['trial', 'starter', 'growth', 'group'], default: 'trial' },
    status: { type: String, enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'], default: 'trial' },
    trialEndsAt: { type: Date, default: null },
    // Write version used to serialize organization-level quota checks in transactions.
    quotaVersion: { type: Number, min: 0, default: 0 },
  },
  settings: {
    academicYearStartMonth: { type: Number, min: 1, max: 12, default: 4 },
    dateFormat: { type: String, enum: ['DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'], default: 'DD-MM-YYYY' },
    defaultLanguage: { type: String, enum: ['en', 'hi', 'gu'], default: 'en' },
  },
}, { timestamps: true, strict: 'throw' });

OrganizationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Organization', OrganizationSchema);
