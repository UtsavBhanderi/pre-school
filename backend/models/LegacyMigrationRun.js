'use strict';

const mongoose = require('mongoose');

const LegacyMigrationRunSchema = new mongoose.Schema({
  fingerprint: { type: String, required: true, unique: true, immutable: true, match: /^[a-f\d]{64}$/i },
  sourceSchoolLabel: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  changeTicket: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  status: { type: String, enum: ['applying', 'completed'], required: true, default: 'applying' },
  summary: {
    selectedStudents: { type: Number, min: 0, default: 0 },
    selectedAttendanceRecords: { type: Number, min: 0, default: 0 },
    selectedLegacyFeeRecords: { type: Number, min: 0, default: 0 },
    feeInvoicesCreated: { type: Number, min: 0, default: 0 },
    paymentTransactionsCreated: { type: Number, min: 0, default: 0 },
    databaseOperations: { type: Number, min: 0, default: 0 },
    staffMembershipsCreated: { type: Number, min: 0, default: 0 },
    staffProfilesCreated: { type: Number, min: 0, default: 0 },
  },
  startedAt: { type: Date, required: true, default: Date.now, immutable: true },
  completedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

LegacyMigrationRunSchema.index({ organizationId: 1, createdAt: -1 });
LegacyMigrationRunSchema.index({ organizationId: 1, branchId: 1, status: 1 });

module.exports = mongoose.model('LegacyMigrationRun', LegacyMigrationRunSchema);
