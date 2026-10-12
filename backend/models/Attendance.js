'use strict';

const mongoose = require('mongoose');

const StudentDetailsSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
  },
  status: {
    type: String,
    enum: ['present', 'absent'],
    required: true,
  },
  reason: { type: String, default: '' },
});

const AttendanceSchema = new mongoose.Schema({
  // Legacy rows may not carry tenant IDs. SaaS queries must always filter them.
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  standard: { type: String, trim: true, maxlength: 80, default: '' },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  date: { type: Date, required: true, index: true },
  studentDetails: {
    type: [StudentDetailsSchema],
    required: true,
    validate: {
      validator: (details) => Array.isArray(details) && details.length > 0,
      message: 'Attendance must include at least one student.',
    },
  },
}, { timestamps: true });

AttendanceSchema.index({ organizationId: 1, branchId: 1, date: 1, standard: 1 }, {
  unique: true,
  partialFilterExpression: {
    organizationId: { $type: 'objectId' },
    branchId: { $type: 'objectId' },
  },
});
AttendanceSchema.index({ organizationId: 1, branchId: 1, date: -1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
