'use strict';

const mongoose = require('mongoose');

const StaffAttendanceSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  staffUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  attendanceDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, immutable: true, index: true },
  status: { type: String, enum: ['present', 'late', 'half_day', 'absent', 'on_leave'], required: true, default: 'present', index: true },
  source: { type: String, enum: ['self_service', 'manager', 'approved_leave'], required: true, default: 'self_service' },
  checkInAt: { type: Date, default: null },
  checkOutAt: { type: Date, default: null },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  managerReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true, strict: 'throw' });

StaffAttendanceSchema.index(
  { organizationId: 1, branchId: 1, staffUserId: 1, attendanceDate: 1 },
  { unique: true }
);
StaffAttendanceSchema.index({ organizationId: 1, branchId: 1, attendanceDate: 1, status: 1 });
StaffAttendanceSchema.index({ organizationId: 1, staffUserId: 1, attendanceDate: -1 });

module.exports = mongoose.model('StaffAttendance', StaffAttendanceSchema);
