'use strict';

const express = require('express');
const mongoose = require('mongoose');
const ReportCard = require('../models/ReportCard');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { validateReportTemplate } = require('../utils/reportTemplateValidation');

const router = express.Router();

router.post('/create', async (req, res) => {
  const validation = validateReportTemplate(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message });
  try {
    const students = await Student.find({ standard: validation.value.standard }).select('_id').lean();
    if (!students.length) return res.status(404).json({ message: 'No students were found in the selected class.' });
    const newReport = await ReportCard.create({ ...validation.value, students: students.map((student) => student._id) });
    return res.status(201).json({ message: 'Report created successfully.', newReport });
  } catch (error) {
    console.error('Unable to create report template:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The report template could not be created. Please try again.' });
  }
});

router.get('/', async (_req, res) => {
  try {
    const reports = await ReportCard.find().sort({ createdAt: -1, _id: -1 }).lean();
    return res.json(reports);
  } catch (error) {
    console.error('Unable to load report templates:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Report templates could not be loaded.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid report template.' });
  try {
    const report = await ReportCard.findById(req.params.id).select('_id').lean();
    if (!report) return res.status(404).json({ message: 'Report template not found.' });

    const hasSavedMarks = await Student.exists({ 'marks.reportId': report._id });
    if (hasSavedMarks) {
      return res.status(409).json({
        code: 'REPORT_HISTORY_PRESERVED',
        message: 'This report has saved student marks and cannot be deleted. Keep it so historical results remain available.',
      });
    }

    const deleted = await ReportCard.findOneAndDelete({ _id: report._id });
    if (!deleted) return res.status(404).json({ message: 'Report template not found.' });
    return res.json({ message: 'Report template deleted.' });
  } catch (error) {
    console.error('Unable to delete report template:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The report template could not be deleted.' });
  }
});

router.put('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid report template.' });
  try {
    const report = await ReportCard.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report template not found.' });
    const hasSavedMarks = await Student.exists({ 'marks.reportId': report._id });
    if (hasSavedMarks
      && Object.prototype.hasOwnProperty.call(req.body || {}, 'description')
      && String(req.body.description).trim() !== String(report.description).trim()) {
      return res.status(409).json({
        code: 'REPORT_MARKS_ALREADY_RECORDED',
        message: 'The maximum mark cannot be changed after student marks have been saved. Create a new report template for a different marking scale.',
      });
    }
    const payload = {
      reportName: Object.prototype.hasOwnProperty.call(req.body || {}, 'reportName') ? req.body.reportName : report.reportName,
      standard: report.standard,
      description: Object.prototype.hasOwnProperty.call(req.body || {}, 'description') ? req.body.description : report.description,
    };
    const validation = validateReportTemplate(payload);
    if (!validation.valid) return res.status(400).json({ message: validation.message });
    report.reportName = validation.value.reportName;
    report.description = validation.value.description;
    await report.save();
    return res.json({ message: 'Report template updated.', report });
  } catch (error) {
    console.error('Unable to update report template:', error?.name || 'database_error');
    return res.status(500).json({ message: 'The report template could not be updated.' });
  }
});

router.get('/:reportId/roster', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) {
    return res.status(400).json({ message: 'Choose a valid report template.' });
  }
  try {
    const report = await ReportCard.findById(req.params.reportId).lean();
    if (!report) return res.status(404).json({ message: 'Report template not found.' });
    const [students, subjectConfig] = await Promise.all([
      Student.find({ _id: { $in: report.students || [] }, standard: report.standard })
        .select('firstName middleName lastName stuNo standard marks')
        .sort({ firstName: 1, middleName: 1, lastName: 1, _id: 1 })
        .lean(),
      Subject.findOne({ standard: report.standard }).select('subjects').lean(),
    ]);
    return res.json({
      report: { _id: report._id, reportName: report.reportName, standard: report.standard, outOfMarks: Number(report.description) },
      students,
      subjects: Array.isArray(subjectConfig?.subjects) ? subjectConfig.subjects : [],
    });
  } catch (error) {
    console.error('Unable to load report roster:', error?.name || 'query_error');
    return res.status(500).json({ message: 'The report class list could not be loaded.' });
  }
});
router.get('/:reportId/students', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.reportId)) return res.status(400).json({ message: 'Choose a valid report template.' });
  try {
    const report = await ReportCard.findById(req.params.reportId)
      .populate({ path: 'students', select: 'firstName middleName lastName stuNo standard marks' })
      .lean();
    if (!report) return res.status(404).json({ message: 'Report template not found.' });
    const students = (report.students || []).filter(Boolean).map((student) => {
      const result = (student.marks || []).find((item) => String(item.reportId || '') === String(report._id));
      return {
        name: [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').trim(),
        stuNo: student.stuNo || '',
        standard: student.standard || report.standard,
        marks: result?.subjectData || [],
        total: result?.total ?? null,
        percentage: result?.percentage ?? null,
        grade: result?.grade || '',
      };
    });
    return res.json(students);
  } catch (error) {
    console.error('Unable to export report students:', error?.name || 'database_error');
    return res.status(500).json({ message: 'Student report results could not be loaded.' });
  }
});

module.exports = router;
