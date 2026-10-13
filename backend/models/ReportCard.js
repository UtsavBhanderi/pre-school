'use strict';

const mongoose = require('mongoose');

const reportCardSchema = new mongoose.Schema({
  // Legacy documents remain null-scoped until an explicit migration maps the
  // report and validates every referenced student.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  reportName: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
  },
  standard: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  }],
}, { strict: true });

reportCardSchema.index({ organizationId: 1, branchId: 1, status: 1, standard: 1, createdAt: -1 });
reportCardSchema.index({ organizationId: 1, branchId: 1, reportName: 1, standard: 1 });

module.exports = mongoose.model('ReportCard', reportCardSchema);
