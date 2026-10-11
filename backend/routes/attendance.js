// routes/attendance.js
const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { getAttendance, markAttendance, updateAttendance } = require('../controllers/attendanceController');

router.post('/', async (req, res) => {
  const { date, studentDetails } = req.body;

  try {
    const attendance = new Attendance({ date, studentDetails });

    await attendance.save();
    res.json(attendance);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// routes/attendance.js
router.get('/student/:id', async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find({ studentId: req.params.id });
    res.json(attendanceRecords);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get students by standard
router.get('/students', async (req, res) => {
  try {
    const { standard } = req.query;
    const students = await Student.find({ standard });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

router.get('/attendance/:date?', async (req, res) => {
  try {
    let queryDate;

    if (req.params.date) {
      // If date parameter is provided
      queryDate = new Date(req.params.date);
    } else {
      // Default to today's date
      const today = new Date();
      queryDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    }

    // Ensure date is set to start of the day for accurate querying
    // queryDate.setHours(0, 0, 0, 0);

    // datas = await Attendance.find({ createdAt: { $gt: firstDay, $lt: lastDay } })
    const attendance = await Attendance.findOne({ date: queryDate })
      // const attendance = await Attendance.find({ date: queryDate })
      .populate('studentDetails.studentId', 'middleName standard stuNo');
    if (!attendance) {
      return res.status(404).json({ message: 'No attendance found for this date' });
    }

    res.json(attendance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
});

// GET /api/attendances - Fetch attendance records (with optional date and standard filters)
router.get('/attendances', async (req, res) => {
  try {
    const { date, standard, middleName, stuNo, status, reason } = req.query;

    // Construct query object with optional filters
    let query = {};
    if (date) {
      query.date = new Date(date);
    }

    // Find attendance records based on date
    let attendances = await Attendance.find(query).populate({
      path: 'studentDetails.studentId',
      model: 'Student',
      select: 'stuNo middleName standard', // Selecting the necessary fields from the Student model
    });

    // If a standard is provided, filter studentDetails based on the standard
    if (standard) {
      attendances = attendances.map(attendance => {
        const filteredDetails = attendance.studentDetails.filter(student => student.studentId.standard === standard);
        return { ...attendance._doc, studentDetails: filteredDetails };
      });
    }

    // If a Name is provided, filter studentDetails based on the Name
    if (middleName) {
      attendances = attendances.map(attendance => {
        const filteredDetails = attendance.studentDetails.filter(student => student.studentId.middleName === middleName);
        return { ...attendance._doc, studentDetails: filteredDetails };
      });
    }

    // If a Name is provided, filter studentDetails based on the Name
    if (stuNo) {
      attendances = attendances.map(attendance => {
        const filteredDetails = attendance.studentDetails.filter(student => student.studentId.stuNo === stuNo);
        return { ...attendance._doc, studentDetails: filteredDetails };
      });
    }

    // If a status is provided, filter studentDetails based on the status
    if (status) {
      attendances = attendances.map(attendance => {
        const filteredDetails = attendance.studentDetails.filter(student => student.status === status);
        return { ...attendance._doc, studentDetails: filteredDetails };
      });
    }

    res.json(attendances);
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

//-------down side all are in use
// PUT /api/attendances/:attendanceId/student/:studentId - Update student status in attendance

router.put('/attendances/:attendanceId/student/:studentId', async (req, res) => {
  try {
    const { attendanceId, studentId } = req.params;
    // const { status } = req.body;
    const { status, reason } = req.body;
    // Find the attendance record by ID
    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Find the specific student within the attendance record
    const studentDetail = attendance.studentDetails.find(detail => detail.studentId.toString() === studentId);
    if (!studentDetail) {
      return res.status(404).json({ message: 'Student not found in attendance record' });
    }
    // Update the student's status
    studentDetail.status = status;
    studentDetail.reason = reason;

    // Save the updated attendance record
    await attendance.save();

    res.json({ message: 'Student status updated successfully' });
  } catch (error) {
    console.error('Error updating student status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/attendance', getAttendance); // Fetch attendance
// router.post('/attendance', markAttendance); // Mark attendance
// router.put('/attendance/:id', updateAttendance); // Edit attendance
router.post('/attendance', async (req, res) => {
  try {
    const { date, studentDetails } = req.body;

    // Validate reasons for absentees
    for (let detail of studentDetails) {
      if (detail.status === 'absent' && !detail.reason) {
        return res.status(400).json({ error: 'Reason is required for all absent students.' });
      }
    }

    const newAttendance = new Attendance({ date, studentDetails });
    await newAttendance.save();

    res.status(201).json({ message: 'Attendance saved successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save attendance.' });
  }
});

module.exports = router;