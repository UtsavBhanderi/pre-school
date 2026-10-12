'use strict';

const mongoose = require('mongoose');

const StaffLeaveRequestSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  staffUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  leaveType: { type: String, enum: ['annual', 'sick', 'personal', 'family', 'unpaid', 'other'], required: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  partialDay: { type: String, enum: ['full', 'first_half', 'second_half'], default: 'full' },
  requestedDays: { type: Number, required: true, min: 0.5, max: 90 },
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  decisionNote: { type: String, trim: true, maxlength: 1000, default: '' },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

StaffLeaveRequestSchema.index({ organizationId: 1, branchId: 1, staffUserId: 1, status: 1, startDate: 1, endDate: 1 });
StaffLeaveRequestSchema.index({ organizationId: 1, branchId: 1, status: 1, startDate: 1 });

module.exports = mongoose.model('StaffLeaveRequest', StaffLeaveRequestSchema);
