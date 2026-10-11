const express = require('express');
const router = express.Router();
const ReportCard = require('../models/ReportCard');
const Student = require('../models/Student');

// // Create a new report
// router.post('/create', async (req, res) => {
//   const { reportName, standard, description } = req.body;

//   try {
//     const report = new ReportCard({ reportName, standard, description });
//     await report.save();
//     res.status(201).json({ message: 'Report created successfully', report });
//   } catch (error) {
//     res.status(500).json({ message: 'Error creating report', error });
//   }
// });

router.post('/create', async (req, res) => {
  const { reportName, standard, description } = req.body;

  try {
    // Fetch all students with the selected standard
    const students = await Student.find({ standard });

    if (!students.length) {
      return res.status(404).json({ message: 'No students found for this standard' });
    }

    // Create a new report and associate students
    const newReport = new ReportCard({
      reportName,
      standard,
      description,
      students: students.map(student => student._id)  // Add student IDs to the report
    });

    await newReport.save();

    // res.status(201).json(newReport);
    res.status(201).json({ message: 'Report created successfully', newReport });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all reports
router.get('/', async (req, res) => {
  try {
    const reports = await ReportCard.find();
    res.status(200).json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reports', error });
  }
});

// Delete a report
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await ReportCard.findByIdAndDelete(id);
    res.status(200).json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting report', error });
  }
});

// Edit a report
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { reportName, description } = req.body;

  try {
    const report = await ReportCard.findByIdAndUpdate(id, { reportName, description }, { new: true });
    res.status(200).json({ message: 'Report updated successfully', report });
  } catch (error) {
    res.status(500).json({ message: 'Error updating report', error });
  }
});

router.get('/:reportId/students', async (req, res) => {
  const { reportId } = req.params;

  try {
    // Fetch the report with all associated student data
    const report = await ReportCard.findById(reportId).populate('students');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const studentsData = report.students.map(student => ({
      name: student.middleName,
      stuNo: student.stuNo,
      standard: student.standard,
      marks: student.marks.find((m) => m.reportId.toString() === reportId)?.subjectData || []
      // marks: student.marks.find((m) => m.reportId.toString() === reportId)?.subjectMarks || []
    }));
    
    res.json(studentsData);
  } catch (error) {
    console.error('Error fetching report data:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
