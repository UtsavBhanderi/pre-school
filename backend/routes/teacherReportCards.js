'use strict';

const express = require('express');
const mongoose = require('mongoose');
const ReportCard = require('../models/ReportCard');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { getLegacyTeacherScope } = require('../utils/legacyTeacherClass');
const { validateStudentReportMarks, calculateStudentReportResult } = require('../utils/studentReportMarks');

const router = express.Router();
const legacyStudentFilter = { $or: [{ organizationId: null }, { organizationId: { $exists: false } }] };

async function getAssignedClass(req, res) {
  if (req.user?.role !== 'teacher') {
    res.status(403).json({ message: 'Student report cards are available only to teacher accounts in this workspace.' });
    return null;
  }
  try {
    const scope = await getLegacyTeacherScope(req.user, '');
    if (!scope.allowed) {
      res.status(403).json({ code: scope.code, message: scope.message });
      return null;
    }
    return scope;
  } catch (error) {
    console.error('Unable to verify teacher report-card class:', error?.name || 'teacher_scope_error');
    res.status(503).json({ message: 'Your assigned class could not be verified.' });
    return null;
  }
}

function validIds(req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.reportId)
    || (req.params.studentId && !mongoose.Types.ObjectId.isValid(req.params.studentId))) {
    res.status(400).json({ message: 'Choose a valid report and student.' });
    return false;
  }
  return true;
}

async function findAssignedReport(reportId, standard) {
  return ReportCard.findOne({ _id: reportId, standard })
    .select('reportName standard description students')
    .lean();
}

async function findAssignedStudent(studentId, standard) {
  return Student.findOne({
    _id: studentId,
    standard,
    status: { $ne: 'withdrawn' },
    ...legacyStudentFilter,
  });
}

router.get('/', async (req, res) => {
  const scope = await getAssignedClass(req, res);
  if (!scope) return;
  try {
    const reports = await ReportCard.find({ standard: scope.standard })
      .select('reportName standard description createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return res.json(reports);
  } catch (error) {
    console.error('Unable to load teacher report templates:', error?.name || 'query_error');
    return res.status(503).json({ message: 'Your class report cards could not be loaded.' });
  }
});

router.get('/:reportId/roster', async (req, res) => {
  if (!validIds(req, res)) return;
  const scope = await getAssignedClass(req, res);
  if (!scope) return;
  try {
    const report = await findAssignedReport(req.params.reportId, scope.standard);
    if (!report) return res.status(404).json({ message: 'This report template is not available for your assigned class.' });

    const [students, subjectConfig] = await Promise.all([
      Student.find({
        standard: scope.standard,
        status: { $ne: 'withdrawn' },
        ...legacyStudentFilter,
      })
        .select('firstName middleName lastName stuNo standard batchYear marks')
        .sort({ firstName: 1, middleName: 1, lastName: 1, _id: 1 })
        .lean(),
      Subject.findOne({ standard: scope.standard }).select('subjects').lean(),
    ]);

    // Linking the current class roster keeps the saved results available to
    // each linked parent account, while the teacher never receives another
    // class's roster or data from a student who has transferred out.
    await ReportCard.updateOne(
      { _id: report._id, standard: scope.standard },
      { $addToSet: { students: { $each: students.map((student) => student._id) } } },
    );

    return res.json({
      report: {
        _id: report._id,
        reportName: report.reportName,
        standard: report.standard,
        outOfMarks: Number(report.description),
      },
      students,
      subjects: Array.isArray(subjectConfig?.subjects) ? subjectConfig.subjects : [],
    });
  } catch (error) {
    console.error('Unable to load assigned teacher report roster:', error?.name || 'roster_error');
    return res.status(503).json({ message: 'The report class list could not be loaded.' });
  }
});

router.get('/:reportId/students/:studentId', async (req, res) => {
  if (!validIds(req, res)) return;
  const scope = await getAssignedClass(req, res);
  if (!scope) return;
  try {
    const [report, student] = await Promise.all([
      findAssignedReport(req.params.reportId, scope.standard),
      findAssignedStudent(req.params.studentId, scope.standard),
    ]);
    if (!report || !student || !(report.students || []).some((id) => String(id) === String(student._id))) {
      return res.status(404).json({ message: 'This student report is not available for your assigned class.' });
    }
    const result = (student.marks || []).find((item) => String(item.reportId || '') === String(report._id));
    if (!result) return res.status(404).json({ message: 'No marks have been saved for this student yet.' });
    return res.json({
      subjectData: result.subjectData || [],
      total: result.total ?? 0,
      percentage: result.percentage ?? 0,
      grade: result.grade || 'E',
    });
  } catch (error) {
    console.error('Unable to load assigned student report:', error?.name || 'student_report_error');
    return res.status(503).json({ message: 'Student report details could not be loaded.' });
  }
});

router.post('/:reportId/students/:studentId', async (req, res) => {
  if (!validIds(req, res)) return;
  const scope = await getAssignedClass(req, res);
  if (!scope) return;
  try {
    const [report, student] = await Promise.all([
      findAssignedReport(req.params.reportId, scope.standard),
      findAssignedStudent(req.params.studentId, scope.standard),
    ]);
    if (!report || !student || !(report.students || []).some((id) => String(id) === String(student._id))) {
      return res.status(404).json({ message: 'This student report is not available for your assigned class.' });
    }

    const subjectConfig = await Subject.findOne({ standard: scope.standard }).select('subjects').lean();
    if (!subjectConfig) {
      return res.status(409).json({ message: 'No subjects are configured for your class. Contact the administrator.' });
    }
    const validation = validateStudentReportMarks(req.body?.subjectData, subjectConfig.subjects, report.description);
    if (!validation.valid) return res.status(400).json({ message: validation.message });

    const subjectData = validation.value;
    const result = calculateStudentReportResult(subjectData, report.description);
    if (!Array.isArray(student.marks)) student.marks = [];
    const existingIndex = student.marks.findIndex((item) => String(item.reportId || '') === String(report._id));
    const saved = { reportId: report._id, subjectData, ...result };
    if (existingIndex === -1) student.marks.push(saved);
    else student.marks[existingIndex] = saved;
    await student.save();

    return res.json({ message: 'Student report card saved successfully.', ...result });
  } catch (error) {
    console.error('Unable to save assigned student report:', error?.name || 'save_report_error');
    return res.status(503).json({ message: 'Student report marks could not be saved. Please try again.' });
  }
});

module.exports = router;
