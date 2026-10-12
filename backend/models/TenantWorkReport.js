'use strict';

const mongoose = require('mongoose');

const TenantWorkReportSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  reportDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true, immutable: true },
  className: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  subject: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  startTime: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  durationMinutes: { type: Number, required: true, min: 1, max: 840 },
  workSummary: { type: String, required: true, trim: true, minlength: 10, maxlength: 5000 },
  studentsPresent: { type: Number, required: true, min: 0, max: 1000 },
  classEnrollmentCount: { type: Number, required: true, min: 0, max: 1000, immutable: true },
  status: { type: String, enum: ['submitted', 'reviewed', 'needs_follow_up'], default: 'submitted', required: true, index: true },
  submittedAt: { type: Date, required: true, default: Date.now, immutable: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
  reviewHistory: [{
    _id: false,
    status: { type: String, enum: ['reviewed', 'needs_follow_up'], required: true },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedAt: { type: Date, required: true },
  }],
  revision: { type: Number, min: 1, default: 1 },
}, { timestamps: true, strict: 'throw' });

TenantWorkReportSchema.index(
  { organizationId: 1, branchId: 1, submittedBy: 1, reportDate: 1, className: 1 },
  { unique: true }
);
TenantWorkReportSchema.index({ organizationId: 1, branchId: 1, reportDate: -1, status: 1 });
TenantWorkReportSchema.index({ organizationId: 1, branchId: 1, className: 1, reportDate: -1 });
TenantWorkReportSchema.index({ organizationId: 1, branchId: 1, reviewedBy: 1, reviewedAt: -1 });

module.exports = mongoose.model('TenantWorkReport', TenantWorkReportSchema);
