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

module.exports = mongoose.model('Attendance', AttendanceSchema);
