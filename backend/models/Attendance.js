// models/Attendance.js
const mongoose = require('mongoose');

const StudentDetails = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
  },
  // standard: { type: String, required: true }, // Adding standard for easier filtering
  status: {
    type: String, // "present" or "absent"
    enum: ['present', 'absent']
  },
  reason: { type: String, default: "0" } // field for absence reason
});

const AttendanceSchema = new mongoose.Schema({
  date: {
    type: Date
  },
  studentDetails: [StudentDetails],
});

module.exports = mongoose.model('Attendance', AttendanceSchema);
