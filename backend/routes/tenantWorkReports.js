'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const TenantClass = require('../models/TenantClass');
const TenantWorkReport = require('../models/TenantWorkReport');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { getTodayInTimeZone } = require('../utils/zonedDate');
const {
  canReadWorkReports,
  canReviewWorkReports,
  canTeacherAccessClass,
  validateWorkReportInput,
  validateReportRange,
  reviewTransition,
} = require('../utils/tenantWorkReportPolicy');

const router = express.Router();
router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

async function writeAudit(req, session, report, action, changedFields, reason = '') {
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    actorUserId: req.user._id,
    action,
    resourceType: 'tenant_work_report',
    resourceId: String(report._id),
    outcome: 'success',
    reason: clean(reason, 500),
    summary: action === 'work_report.created'
      ? 'Daily work report submitted by ' + String(req.user.username || 'teacher') + ' for ' + report.className + '.'
      : action === 'work_report.reviewed'
        ? 'Daily work report reviewed for ' + report.className + '.'
        : 'Daily work report updated for ' + report.className + '.',
    changedFields,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
}

function serialize(report) {
  return {
    id: String(report._id),
    reportDate: report.reportDate,
    className: report.className,
    subject: report.subject,
    startTime: report.startTime,
    endTime: report.endTime,
    durationMinutes: report.durationMinutes,
    durationHours: Math.round((report.durationMinutes / 60) * 100) / 100,
    workSummary: report.workSummary,
    studentsPresent: report.studentsPresent,
    classEnrollmentCount: report.classEnrollmentCount,
    status: report.status,
    submittedAt: report.submittedAt,
    submittedBy: report.submittedBy ? {
      id: String(report.submittedBy._id || report.submittedBy),
      name: report.submittedBy.username || '',
      email: report.submittedBy.email || '',
    } : null,
    reviewedAt: report.reviewedAt || null,
    reviewedBy: report.reviewedBy ? {
      id: String(report.reviewedBy._id || report.reviewedBy),
      name: report.reviewedBy.username || '',
    } : null,
    reviewNote: report.reviewNote || '',
    revision: report.revision,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function fetchSerializedReport(filter) {
  return TenantWorkReport.findOne(filter)
    .populate({ path: 'submittedBy', select: 'username email' })
    .populate({ path: 'reviewedBy', select: 'username' })
    .lean();
}

function assertTeacherClass(req, className) {
  return req.tenant.membership.role !== 'teacher' || canTeacherAccessClass(req.tenant.membership, className);
}

router.get('/', requireBranchContext, async (req, res) => {
  if (!canReadWorkReports(req.tenant.membership)) {
    return res.status(403).json({ message: 'Your account cannot view daily teacher work reports.' });
  }

  const timezone = req.tenant.branch.timezone || req.tenant.organization.timezone || 'Asia/Kolkata';
  const today = getTodayInTimeZone(timezone);
  const fromDefault = new Date((today || new Date().toISOString().slice(0, 10)) + 'T00:00:00.000Z');
  fromDefault.setUTCDate(fromDefault.getUTCDate() - 29);
  const from = clean(req.query.from, 10) || fromDefault.toISOString().slice(0, 10);
  const to = clean(req.query.to, 10) || today;
  const range = validateReportRange(from, to, 92);
  if (!range.valid) return res.status(400).json({ message: range.message });
  if (range.to > today) return res.status(400).json({ message: 'The report end date cannot be in the future.' });

  const filter = {
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    reportDate: { $gte: range.from, $lte: range.to },
  };
  const membership = req.tenant.membership;

  if (membership.role === 'teacher') {
    const classes = Array.isArray(membership.classNames) ? membership.classNames : [];
    if (!classes.length) return res.json({ from: range.from, to: range.to, total: 0, reports: [] });
    filter.submittedBy = req.user._id;
    filter.className = { $in: classes };
  } else if (req.query.teacherId) {
    if (!isObjectId(req.query.teacherId)) return res.status(400).json({ message: 'Choose a valid teacher account.' });
    filter.submittedBy = req.query.teacherId;
  }

  if (req.query.className) {
    const className = clean(req.query.className, 80);
    if (!assertTeacherClass(req, className)) return res.status(403).json({ message: 'You can only view reports for your assigned classes.' });
    filter.className = className;
  }
  if (['submitted', 'reviewed', 'needs_follow_up'].includes(req.query.status)) filter.status = req.query.status;

  try {
    const reports = await TenantWorkReport.find(filter)
      .populate({ path: 'submittedBy', select: 'username email' })
      .populate({ path: 'reviewedBy', select: 'username' })
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(500)
      .lean();
    return res.json({ from: range.from, to: range.to, total: reports.length, reports: reports.map(serialize) });
  } catch (error) {
    console.error('Unable to list tenant work reports:', error.message);
    return res.status(503).json({ message: 'Daily work reports could not be loaded.' });
  }
});

router.post('/', requireBranchContext, async (req, res) => {
  if (req.tenant.membership.role !== 'teacher') {
    return res.status(403).json({ message: 'Only a teacher account can submit a daily teaching work report.' });
  }
  const validation = validateWorkReportInput(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message, errors: validation.errors });

  const { reportDate, className } = validation.value;
  const today = getTodayInTimeZone(req.tenant.branch.timezone || req.tenant.organization.timezone);
  if (reportDate > today) return res.status(400).json({ message: 'A work report cannot be submitted for a future date.' });
  const earliestAllowed = new Date((today || new Date().toISOString().slice(0, 10)) + 'T00:00:00.000Z');
  earliestAllowed.setUTCDate(earliestAllowed.getUTCDate() - 7);
  if (reportDate < earliestAllowed.toISOString().slice(0, 10)) {
    return res.status(400).json({ message: 'Work reports can be backdated by up to 7 days. Ask your administrator if a correction is needed.' });
  }
  if (!assertTeacherClass(req, className)) {
    return res.status(403).json({ message: 'You can only submit reports for your assigned classes.' });
  }

  try {
    const report = await withTransaction(async (session) => {
      const classroom = await TenantClass.findOne({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        name: className,
        status: 'active',
      }).session(session).lean();
      if (!classroom) {
        const noClass = new Error('This class is not active in the selected branch.');
        noClass.code = 'CLASS_NOT_FOUND';
        throw noClass;
      }

      const enrollmentCount = await Student.countDocuments({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        standard: className,
      }).session(session);
      if (validation.value.studentsPresent > enrollmentCount) {
        const impossibleCount = new Error('Students present cannot exceed the number of children registered in this class (' + enrollmentCount + ').');
        impossibleCount.code = 'STUDENT_COUNT_EXCEEDS_ENROLLMENT';
        throw impossibleCount;
      }

      const [created] = await TenantWorkReport.create([{
        ...validation.value,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        submittedBy: req.user._id,
        classEnrollmentCount: enrollmentCount,
        status: 'submitted',
        submittedAt: new Date(),
      }], { session });

      await writeAudit(req, session, created, 'work_report.created',
        ['reportDate', 'className', 'subject', 'startTime', 'endTime', 'workSummary', 'studentsPresent']);
      return created;
    });

    const populated = await fetchSerializedReport({
      _id: report._id,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    });
    return res.status(201).json({ message: 'Daily work report submitted for review.', report: serialize(populated) });
  } catch (error) {
    if (error.code === 'CLASS_NOT_FOUND') return res.status(400).json({ message: error.message });
    if (error.code === 'STUDENT_COUNT_EXCEEDS_ENROLLMENT') return res.status(400).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'You already submitted a report for this class and date. Open the existing report to edit it.' });
    console.error('Unable to create tenant work report:', error.message);
    return res.status(503).json({ message: 'The daily work report could not be submitted safely.' });
  }
});

router.put('/:id', requireBranchContext, async (req, res) => {
  if (req.tenant.membership.role !== 'teacher') {
    return res.status(403).json({ message: 'Only the submitting teacher can edit an unreviewed work report.' });
  }
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Choose a valid report.' });
  const validation = validateWorkReportInput(req.body || {});
  if (!validation.valid) return res.status(400).json({ message: validation.message, errors: validation.errors });
  if (!assertTeacherClass(req, validation.value.className)) {
    return res.status(403).json({ message: 'You can only edit reports for your assigned classes.' });
  }

  try {
    const updated = await withTransaction(async (session) => {
      const report = await TenantWorkReport.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        submittedBy: req.user._id,
      }).session(session);
      if (!report) {
        const missing = new Error('Report not found in this branch.');
        missing.code = 'REPORT_NOT_FOUND';
        throw missing;
      }
      if (report.status !== 'submitted') {
        const locked = new Error('This report has already been reviewed and can no longer be edited.');
        locked.code = 'REPORT_LOCKED';
        throw locked;
      }
      if (report.className !== validation.value.className || report.reportDate !== validation.value.reportDate) {
        const fixed = new Error('Report date and class cannot be changed when editing. Submit a separate report after speaking to your administrator.');
        fixed.code = 'REPORT_KEY_IMMUTABLE';
        throw fixed;
      }
      if (validation.value.studentsPresent > report.classEnrollmentCount) {
        const impossibleCount = new Error('Students present cannot exceed the class enrollment snapshot (' + report.classEnrollmentCount + ').');
        impossibleCount.code = 'STUDENT_COUNT_EXCEEDS_ENROLLMENT';
        throw impossibleCount;
      }
      Object.assign(report, {
        subject: validation.value.subject,
        startTime: validation.value.startTime,
        endTime: validation.value.endTime,
        durationMinutes: validation.value.durationMinutes,
        workSummary: validation.value.workSummary,
        studentsPresent: validation.value.studentsPresent,
        revision: report.revision + 1,
      });
      await report.save({ session });
      await writeAudit(req, session, report, 'work_report.updated',
        ['subject', 'startTime', 'endTime', 'workSummary', 'studentsPresent', 'revision'],
        clean(req.body.reason, 500));
      return report;
    });

    const populated = await fetchSerializedReport({
      _id: updated._id,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    });
    return res.json({ message: 'Work report updated.', report: serialize(populated) });
  } catch (error) {
    if (['REPORT_NOT_FOUND', 'REPORT_LOCKED', 'REPORT_KEY_IMMUTABLE', 'STUDENT_COUNT_EXCEEDS_ENROLLMENT'].includes(error.code)) {
      return res.status(error.code === 'REPORT_NOT_FOUND' ? 404 : 409).json({ message: error.message });
    }
    if (error.code === 11000) return res.status(409).json({ message: 'This class already has a report for that date.' });
    console.error('Unable to update tenant work report:', error.message);
    return res.status(503).json({ message: 'The report could not be updated safely.' });
  }
});

router.patch('/:id/review', requireBranchContext, async (req, res) => {
  if (!canReviewWorkReports(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an organization or branch administrator can review work reports.' });
  }
  if (!isObjectId(req.params.id)) return res.status(400).json({ message: 'Choose a valid report.' });
  const requestedStatus = clean(req.body?.status, 40);
  const reviewNote = clean(req.body?.reviewNote, 1000);

  try {
    const updated = await withTransaction(async (session) => {
      const report = await TenantWorkReport.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
      }).session(session);
      if (!report) {
        const missing = new Error('Report not found in this branch.');
        missing.code = 'REPORT_NOT_FOUND';
        throw missing;
      }
      const transition = reviewTransition(report.status, requestedStatus, reviewNote);
      if (!transition.valid) {
        const invalid = new Error(transition.message);
        invalid.code = 'REVIEW_INVALID';
        throw invalid;
      }
      report.status = transition.status;
      report.reviewNote = transition.reviewNote;
      report.reviewedBy = req.user._id;
      report.reviewedAt = new Date();
      await report.save({ session });
      await writeAudit(req, session, report, 'work_report.reviewed',
        ['status', 'reviewNote', 'reviewedBy', 'reviewedAt'], reviewNote);
      return report;
    });

    const populated = await fetchSerializedReport({
      _id: updated._id,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    });
    return res.json({ message: requestedStatus === 'reviewed' ? 'Work report marked as reviewed.' : 'Follow-up requested for this report.', report: serialize(populated) });
  } catch (error) {
    if (error.code === 'REPORT_NOT_FOUND' || error.code === 'REVIEW_INVALID') {
      return res.status(error.code === 'REPORT_NOT_FOUND' ? 404 : 409).json({ message: error.message });
    }
    console.error('Unable to review tenant work report:', error.message);
    return res.status(503).json({ message: 'The work report could not be reviewed safely.' });
  }
});

module.exports = router;
