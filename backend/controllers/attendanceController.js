// controllers/attendanceController.js
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

// Fetch attendance by standard or date
const getAttendance = async (req, res) => {
  try {
    const { standard, date } = req.query;
    let filter = {};

    if (standard) filter['studentDetails.standard'] = standard;
    if (date) filter.date = date;

    const attendances = await Attendance.find(filter).populate('studentDetails.studentId', 'name standard');
    res.status(200).json(attendances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

// Mark new attendance
const markAttendance = async (req, res) => {
  try {
    const { date, studentDetails } = req.body;
    const attendance = new Attendance({ date, studentDetails });
    await attendance.save();
    res.status(201).json(attendance);
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
};

// Update attendance status
const updateAttendance = async (req, res) => {
  try {
    const { studentId, status } = req.body;
    const { id } = req.params;

    const attendance = await Attendance.findOneAndUpdate(
      { _id: id, 'studentDetails.studentId': studentId },
      { $set: { 'studentDetails.$.status': status } },
      { new: true }
    );

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance not found' });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update attendance' });
  }
};

module.exports = { getAttendance, markAttendance, updateAttendance };
