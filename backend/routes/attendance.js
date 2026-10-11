'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

const VALID_STATUSES = new Set(['present', 'absent']);
const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

router.get('/students', async (req, res) => {
  const standard = String(req.query.standard || '').trim();
  if (!standard) return res.status(400).json({ message: 'A standard is required.' });

  try {
    const students = await Student.find({ standard })
      .select('stuNo firstName middleName lastName standard')
      .sort({ middleName: 1 })
      .lean();
    return res.json(students);
  } catch (error) {
    console.error('Unable to load attendance students:', error);
    return res.status(500).json({ message: 'Unable to load students.' });
  }
});

router.get('/attendances', async (req, res) => {
  try {
    const { date, standard, middleName, stuNo, status } = req.query;
    const filter = {};

    if (date) {
      const parsedDate = toDate(date);
      if (!parsedDate) return res.status(400).json({ message: 'Invalid attendance date.' });
      const dayStart = new Date(parsedDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      filter.date = { $gte: dayStart, $lt: dayEnd };
    }

    let attendances = await Attendance.find(filter)
      .sort({ date: -1 })
      .populate({
        path: 'studentDetails.studentId',
        model: 'Student',
        select: 'stuNo firstName middleName lastName standard',
      });

    const searchName = String(middleName || '').trim().toLowerCase();
    const searchStuNo = String(stuNo || '').trim().toLowerCase();

    if (standard || searchName || searchStuNo || status) {
      attendances = attendances.map((attendance) => {
        const studentDetails = attendance.studentDetails.filter((detail) => {
          const student = detail.studentId;
          if (!student) return false;
          if (standard && student.standard !== standard) return false;
          if (searchName && !String(student.middleName || '').toLowerCase().includes(searchName)) return false;
          if (searchStuNo && !String(student.stuNo || '').toLowerCase().includes(searchStuNo)) return false;
          if (status && detail.status !== status) return false;
          return true;
        });
        return { ...attendance.toObject(), studentDetails };
      }).filter((attendance) => attendance.studentDetails.length > 0);
    }

    return res.json(attendances);
  } catch (error) {
    console.error('Unable to fetch attendance records:', error);
    return res.status(500).json({ message: 'Unable to fetch attendance records.' });
  }
});

router.post('/attendance', async (req, res) => {
  try {
    const date = toDate(req.body.date);
    const studentDetails = req.body.studentDetails;

    if (!date) return res.status(400).json({ message: 'A valid attendance date is required.' });
    if (!Array.isArray(studentDetails) || studentDetails.length === 0) {
      return res.status(400).json({ message: 'At least one student is required.' });
    }

    const uniqueStudentIds = new Set();
    for (const detail of studentDetails) {
      if (!detail || !mongoose.Types.ObjectId.isValid(detail.studentId)) {
        return res.status(400).json({ message: 'An attendance entry contains an invalid student ID.' });
      }
      if (uniqueStudentIds.has(String(detail.studentId))) {
        return res.status(400).json({ message: 'A student can appear only once in an attendance entry.' });
      }
      uniqueStudentIds.add(String(detail.studentId));

      if (!VALID_STATUSES.has(detail.status)) {
        return res.status(400).json({ message: 'Each student must be marked present or absent.' });
      }
      if (detail.status === 'absent' && !String(detail.reason || '').trim()) {
        return res.status(400).json({ message: 'An absence reason is required for every absent student.' });
      }
    }

    const existingStudents = await Student.countDocuments({ _id: { $in: [...uniqueStudentIds] } });
    if (existingStudents !== uniqueStudentIds.size) {
      return res.status(400).json({ message: 'One or more students do not exist.' });
    }

    const record = await Attendance.create({
      date,
      studentDetails: studentDetails.map((detail) => ({
        studentId: detail.studentId,
        status: detail.status,
        reason: detail.status === 'absent' ? String(detail.reason).trim() : '',
      })),
    });

    return res.status(201).json({ message: 'Attendance saved successfully.', attendance: record });
  } catch (error) {
    console.error('Unable to save attendance:', error);
    return res.status(500).json({ message: 'Unable to save attendance.' });
  }
});

router.put('/attendances/:attendanceId/student/:studentId', async (req, res) => {
  try {
    const { attendanceId, studentId } = req.params;
    const status = String(req.body.status || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!mongoose.Types.ObjectId.isValid(attendanceId) || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ message: 'Invalid attendance or student ID.' });
    }
    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Status must be present or absent.' });
    }
    if (status === 'absent' && !reason) {
      return res.status(400).json({ message: 'An absence reason is required.' });
    }

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) return res.status(404).json({ message: 'Attendance record not found.' });

    const detail = attendance.studentDetails.find((entry) => String(entry.studentId) === studentId);
    if (!detail) return res.status(404).json({ message: 'Student is not part of this attendance record.' });

    detail.status = status;
    detail.reason = status === 'absent' ? reason : '';
    await attendance.save();

    return res.json({ message: 'Attendance status updated successfully.' });
  } catch (error) {
    console.error('Unable to update attendance:', error);
    return res.status(500).json({ message: 'Unable to update attendance.' });
  }
});

module.exports = router;
