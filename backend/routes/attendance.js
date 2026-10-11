'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');

const VALID_STATUSES = new Set(['present', 'absent']);

const getUtcDayBounds = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
    ? date
    : null;
};
const toDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

router.get('/students', async (req, res) => {
  const standard = String(req.query.standard || '').trim();
  const dateText = String(req.query.date || '').trim();
  if (!standard) return res.status(400).json({ message: 'A standard is required.' });

  const attendanceDate = dateText ? parseDateOnly(dateText) : null;
  if (dateText && !attendanceDate) {
    return res.status(400).json({ message: 'Choose a valid attendance date.' });
  }

  try {
    const students = await Student.find({ standard })
      .select('stuNo firstName middleName lastName standard')
      .sort({ middleName: 1 })
      .lean();

    const attendanceByStudent = new Map();
    if (attendanceDate && students.length) {
      const { start, end } = getUtcDayBounds(attendanceDate);
      const studentIds = students.map((student) => student._id);
      const records = await Attendance.find({
        date: { $gte: start, $lt: end },
        'studentDetails.studentId': { $in: studentIds },
      })
        .sort({ updatedAt: -1, createdAt: -1 })
        .select('studentDetails')
        .lean();

      // If older data already contains duplicate records, prefer the most
      // recently updated status and avoid creating additional duplicates.
      for (const record of records) {
        for (const detail of record.studentDetails || []) {
          const studentId = String(detail.studentId);
          if (!attendanceByStudent.has(studentId)) {
            attendanceByStudent.set(studentId, {
              status: detail.status,
              reason: detail.reason || '',
              attendanceRecordId: String(record._id),
            });
          }
        }
      }
    }

    return res.json(students.map((student) => {
      const saved = attendanceByStudent.get(String(student._id));
      return {
        ...student,
        attendanceStatus: saved?.status || '',
        attendanceReason: saved?.reason || '',
        attendanceRecordId: saved?.attendanceRecordId || '',
      };
    }));
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
    const inputDate = toDate(req.body.date);
    const studentDetails = req.body.studentDetails;

    if (!inputDate) return res.status(400).json({ message: 'A valid attendance date is required.' });
    if (!Array.isArray(studentDetails) || studentDetails.length === 0) {
      return res.status(400).json({ message: 'At least one student is required.' });
    }

    const day = getUtcDayBounds(inputDate);
    const date = day.start;
    const uniqueStudentIds = new Set();

    for (const detail of studentDetails) {
      if (!detail || !mongoose.Types.ObjectId.isValid(detail.studentId)) {
        return res.status(400).json({ message: 'An attendance entry contains an invalid student ID.' });
      }
      const studentId = String(detail.studentId);
      if (uniqueStudentIds.has(studentId)) {
        return res.status(400).json({ message: 'A student can appear only once in an attendance entry.' });
      }
      uniqueStudentIds.add(studentId);

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

    // Reconcile with records already saved for this day. Re-submitting a class
    // updates its saved statuses instead of creating duplicate student entries.
    const records = await Attendance.find({
      date: { $gte: day.start, $lt: day.end },
      'studentDetails.studentId': { $in: [...uniqueStudentIds] },
    }).sort({ updatedAt: -1, createdAt: -1 });

    const latestEntryByStudent = new Map();
    for (const record of records) {
      for (const entry of record.studentDetails) {
        const studentId = String(entry.studentId);
        if (uniqueStudentIds.has(studentId) && !latestEntryByStudent.has(studentId)) {
          latestEntryByStudent.set(studentId, { record, entry });
        }
      }
    }

    const recordsToSave = new Map();
    const newEntries = [];

    for (const detail of studentDetails) {
      const studentId = String(detail.studentId);
      const existing = latestEntryByStudent.get(studentId);
      const reason = detail.status === 'absent' ? String(detail.reason || '').trim() : '';

      if (existing) {
        existing.entry.status = detail.status;
        existing.entry.reason = reason;
        recordsToSave.set(String(existing.record._id), existing.record);
      } else {
        newEntries.push({ studentId: detail.studentId, status: detail.status, reason });
      }
    }

    // Validate everything before writing, then save each existing attendance
    // document once even when multiple children belong to it.
    const updatedRecords = await Promise.all(
      [...recordsToSave.values()].map((record) => record.save())
    );

    let createdRecord = null;
    if (newEntries.length) {
      createdRecord = await Attendance.create({
        date,
        studentDetails: newEntries,
      });
    }

    const updatedCount = studentDetails.length - newEntries.length;
    const message = updatedCount && newEntries.length
      ? `Attendance saved. ${updatedCount} existing entries updated and ${newEntries.length} new entries added.`
      : updatedCount
        ? `Attendance saved. ${updatedCount} existing entries updated; no duplicate records were created.`
        : `Attendance saved for ${newEntries.length} students.`;

    return res.status(createdRecord ? 201 : 200).json({
      message,
      attendance: createdRecord || updatedRecords[0] || null,
      createdCount: newEntries.length,
      updatedCount,
    });
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
