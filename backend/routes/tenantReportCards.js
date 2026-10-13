'use strict';

const express = require('express');
const mongoose = require('mongoose');
const ReportCard = require('../models/ReportCard');
const Student = require('../models/Student');
const TenantClass = require('../models/TenantClass');
const ChildGuardian = require('../models/ChildGuardian');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const { parseDateOnly } = require('../utils/dateOnly');
const { getTodayInTimeZone } = require('../utils/zonedDate');
const { createCsv } = require('../utils/reportCsv');

const router = express.Router();
router.use(tenantContext);

const MANAGE_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions'];
const MARK_ROLES = [...MANAGE_ROLES, 'teacher'];
const READ_ROLES = [...MARK_ROLES, 'parent'];
const MAX_ROSTER_SIZE = 500;

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function canAccessClass(req, standard) {
  if (req.tenant.membership.role !== 'teacher') return true;
  const assigned = Array.isArray(req.tenant.membership.classNames) ? req.tenant.membership.classNames : [];
  return assigned.includes(standard);
}

function allowed(req, roles, res) {
  if (hasTenantRole(req.tenant?.membership, roles)) return true;
  res.status(403).json({ message: 'Your account does not have permission to access this report.' });
  return false;
}

function validReportId(id) {
  return mongoose.Types.ObjectId.isValid(String(id || ''));
}

function childName(child) {
  return [child.firstName, child.middleName, child.lastName].filter(Boolean).join(' ').trim();
}

async function reportById(req, id, includeArchived = false, session = null) {
  if (!validReportId(id)) return null;
  const filter = {
    _id: id,
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
  };
  if (!includeArchived) filter.status = 'active';
  let query = ReportCard.findOne(filter);
  if (session) query = query.session(session);
  return query;
}

async function readableStudentIds(req, studentIds) {
  const ids = [...new Set((studentIds || []).map((value) => String(value?._id || value)).filter(validReportId)];
  if (req.tenant.membership.role !== 'parent') return ids;
  const guardianIds = req.tenant.membership.guardianIds || [];
  if (!guardianIds.length || !ids.length) return [];
  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    guardianId: { $in: guardianIds },
    childId: { $in: ids },
  }).select('childId').lean();
  return [...new Set(links.map((link) => String(link.childId)))];
}

async function writeAudit(req, session, { action, report, summary, changedFields = [], reason = '' }) {
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    actorUserId: req.user._id,
    action,
    resourceType: 'report_card',
    resourceId: String(report._id),
    outcome: 'success',
    summary: clean(summary, 500),
    reason: clean(reason, 500),
    changedFields,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function serializeReport(report) {
  return {
    id: String(report._id),
    reportName: report.reportName,
    standard: report.standard,
    description: report.description,
    studentCount: Array.isArray(report.students) ? report.students.length : 0,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt || report.createdAt,
    status: report.status || 'active',
  };
}

function validateReportInput(body = {}) {
  const reportName = clean(body.reportName, 120);
  const standard = clean(body.standard, 80);
  const description = clean(body.description, 1500);
  const errors = {};
  if (reportName.length < 2) errors.reportName = 'Report name must contain 2 to 120 characters.';
  if (standard.length < 2) errors.standard = 'Choose a configured class.';
  if (description.length < 3) errors.description = 'Enter a short description for this report.';
  return Object.keys(errors).length ? { valid: false, errors } : {
    valid: true,
    value: { reportName, standard, description },
  };
}

function validateMarkEntry(entry, index, today) {
  const studentId = String(entry?.studentId || '');
  const subjects = Array.isArray(entry?.subjectData) ? entry.subjectData : [];
  const errors = [];
  if (!validReportId(studentId)) errors.push('Entry ' + (index + 1) + ' has an invalid child ID.');
  if (subjects.length < 1 || subjects.length > 30) errors.push('Each student needs between 1 and 30 subject marks.');
  const seenSubjects = new Set();
  const subjectData = [];
  let total = 0;
  for (const [subjectIndex, subject] of subjects.entries()) {
    const name = clean(subject?.subject, 80);
    const mark = typeof subject?.mark === 'string' && subject.mark.trim() === ''
      ? NaN
      : Number(subject?.mark);
    const dateText = clean(subject?.date, 10) || today;
    if (name.length < 2) errors.push('Entry ' + (index + 1) + ', subject ' + (subjectIndex + 1) + ' needs a name.');
    if (seenSubjects.has(name.toLowerCase())) errors.push('A subject may appear only once for each child in a report.');
    seenSubjects.add(name.toLowerCase());
    if (!Number.isFinite(mark) || mark < 0 || mark > 100) errors.push('Marks must be between 0 and 100.');
    if (!parseDateOnly(dateText)) errors.push('Each subject mark needs a valid date.');
    if (Number.isFinite(mark) && mark >= 0 && mark <= 100) total += mark;
    subjectData.push({ subject: name, mark, date: dateText });
  }
  const percentage = subjects.length ? Math.round((total / subjects.length) * 100) / 100 : 0;
  const grade = clean(entry?.grade, 10);
  return {
    valid: errors.length === 0,
    errors,
    value: {
      studentId,
      subjectData,
      total: Math.round(total * 100) / 100,
      percentage,
      grade,
    },
  };
}

async function getScopedRoster(req, report, session = null) {
  const targetIds = await readableStudentIds(req, report.students || []);
  if (!targetIds.length) return [];
  let query = Student.find({
    _id: { $in: targetIds },
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    standard: report.standard,
  }).select('_id firstName middleName lastName stuNo standard marks').sort({ middleName: 1, lastName: 1, firstName: 1 });
  if (session) query = query.session(session);
  return query.lean();
}

router.get('/', requireBranchContext, async (req, res) => {
  if (!allowed(req, READ_ROLES, res)) return;
  const filter = {
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch._id,
    status: 'active',
  };
  if (req.query.standard) filter.standard = clean(req.query.standard, 80);
  if (req.tenant.membership.role === 'teacher') {
    const classes = req.tenant.membership.classNames || [];
    if (!classes.length) return res.json({ total: 0, reports: [] });
    filter.standard = filter.standard ? filter.standard : { $in: classes };
    if (typeof filter.standard === 'string' && !classes.includes(filter.standard)) return res.status(403).json({ message: 'You do not have access to this class.' });
  }
  try {
    let reports = await ReportCard.find(filter).sort({ createdAt: -1, _id: -1 }).limit(500).lean();
    if (req.tenant.membership.role === 'parent') {
      const linkedChildren = await ChildGuardian.find({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        guardianId: { $in: req.tenant.membership.guardianIds || [] },
      }).select('childId').lean();
      const childIds = new Set(linkedChildren.map((link) => String(link.childId)));
      reports = reports.filter((report) => (report.students || []).some((studentId) => childIds.has(String(studentId))));
    }
    return res.json({ total: reports.length, reports: reports.map(serializeReport) });
  } catch (error) {
    console.error('Unable to list report cards:', error.message);
    return res.status(503).json({ message: 'Report cards could not be loaded.' });
  }
});

router.post('/', requireBranchContext, async (req, res) => {
  if (!allowed(req, MANAGE_ROLES, res)) return;
  const validation = validateReportInput(req.body);
  if (!validation.valid) return res.status(400).json({ message: 'Please correct the report details.', errors: validation.errors });
  const { reportName, standard, description } = validation.value;
  if (!canAccessClass(req, standard)) return res.status(403).json({ message: 'You do not have access to this class.' });

  try {
    const schoolClass = await TenantClass.findOne({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      name: standard,
      status: 'active',
    }).lean();
    if (!schoolClass) return res.status(400).json({ message: 'Choose an active class configured in this branch.' });

    const roster = await Student.find({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      standard,
    }).select('_id').limit(MAX_ROSTER_SIZE + 1).lean();
    if (!roster.length) return res.status(400).json({ message: 'Register children in this class before creating a report card.' });
    if (roster.length > MAX_ROSTER_SIZE) return res.status(400).json({ message: 'This class exceeds the report-card roster limit. Split the class into configured groups first.' });

    const duplicate = await ReportCard.findOne({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      standard,
      reportName,
      status: 'active',
    }).select('_id').lean();
    if (duplicate) return res.status(409).json({ message: 'An active report with this name already exists for this class.' });

    const created = await withTransaction(async (session) => {
      const [report] = await ReportCard.create([{
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        reportName,
        standard,
        description,
        students: roster.map((student) => student._id),
        createdBy: req.user._id,
        updatedBy: req.user._id,
        status: 'active',
      }], { session });
      await writeAudit(req, session, {
        action: 'report_card.created',
        report,
        summary: 'Report card created for ' + standard + ': ' + reportName + '.',
        changedFields: ['reportName', 'standard', 'description', 'students'],
      });
      return report;
    });
    return res.status(201).json({ message: 'Report card created.', report: serializeReport(created) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'A report identifier conflict occurred.' });
    console.error('Unable to create report card:', error.message);
    return res.status(503).json({ message: 'The report card could not be created safely.' });
  }
});

router.get('/:id/students', requireBranchContext, async (req, res) => {
  if (!allowed(req, READ_ROLES, res)) return;
  try {
    const report = await reportById(req, req.params.id);
    if (!report) return res.status(404).json({ message: 'Report card not found in this branch.' });
    if (!canAccessClass(req, report.standard)) return res.status(403).json({ message: 'You do not have access to this class.' });
    const roster = await getScopedRoster(req, report.toObject());
    const students = roster.map((student) => {
      const markEntry = (student.marks || []).find((item) => String(item.reportId) === String(report._id));
      return {
        id: String(student._id),
        name: childName(student),
        admissionNumber: student.stuNo || '',
        className: student.standard,
        subjectData: (markEntry?.subjectData || []).map((item) => ({
          subject: item.subject || '',
          mark: item.mark,
          date: item.date || '',
        })),
        total: Number(markEntry?.total || 0),
        percentage: Number(markEntry?.percentage || 0),
        grade: markEntry?.grade || '',
        hasMarks: Boolean(markEntry && Array.isArray(markEntry.subjectData) && markEntry.subjectData.length),
      };
    });
    return res.json({
      report: serializeReport(report),
      children: students,
      markedCount: students.filter((student) => student.hasMarks).length,
      totalChildren: students.length,
    });
  } catch (error) {
    console.error('Unable to load report-card roster:', error.message);
    return res.status(503).json({ message: 'Report-card student data could not be loaded.' });
  }
});

router.patch('/:id', requireBranchContext, async (req, res) => {
  if (!allowed(req, MANAGE_ROLES, res)) return;
  if (!validReportId(req.params.id)) return res.status(400).json({ message: 'Choose a valid report card.' });
  const reportName = req.body?.reportName === undefined ? undefined : clean(req.body.reportName, 120);
  const description = req.body?.description === undefined ? undefined : clean(req.body.description, 1500);
  if (reportName !== undefined && reportName.length < 2) return res.status(400).json({ message: 'Report name must contain at least 2 characters.' });
  if (description !== undefined && description.length < 3) return res.status(400).json({ message: 'Description must contain at least 3 characters.' });
  if (reportName === undefined && description === undefined) return res.status(400).json({ message: 'There are no report-card changes to save.' });

  try {
    const report = await withTransaction(async (session) => {
      const current = await reportById(req, req.params.id, false, session);
      if (!current) {
        const missing = new Error('Report card not found in this branch.');
        missing.code = 'REPORT_NOT_FOUND';
        throw missing;
      }
      const changedFields = [];
      if (reportName !== undefined && reportName !== current.reportName) {
        const duplicate = await ReportCard.findOne({
          _id: { $ne: current._id },
          organizationId: req.tenant.organization._id,
          branchId: req.tenant.branch._id,
          standard: current.standard,
          reportName,
          status: 'active',
        }).select('_id').session(session).lean();
        if (duplicate) {
          const conflict = new Error('An active report with this name already exists for this class.');
          conflict.code = 'REPORT_NAME_CONFLICT';
          throw conflict;
        }
        current.reportName = reportName;
        changedFields.push('reportName');
      }
      if (description !== undefined && description !== current.description) {
        current.description = description;
        changedFields.push('description');
      }
      if (!changedFields.length) return current;
      current.updatedBy = req.user._id;
      current.updatedAt = new Date();
      await current.save({ session });
      await writeAudit(req, session, {
        action: 'report_card.updated',
        report: current,
        summary: 'Report card updated: ' + current.reportName + '.',
        changedFields,
      });
      return current;
    });
    return res.json({ message: 'Report card updated.', report: serializeReport(report) });
  } catch (error) {
    if (error.code === 'REPORT_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'REPORT_NAME_CONFLICT') return res.status(409).json({ message: error.message });
    console.error('Unable to update report card:', error.message);
    return res.status(503).json({ message: 'Report card could not be updated safely.' });
  }
});

router.post('/:id/marks', requireBranchContext, async (req, res) => {
  if (!allowed(req, MARK_ROLES, res)) return;
  if (!validReportId(req.params.id)) return res.status(400).json({ message: 'Choose a valid report card.' });
  const submitted = Array.isArray(req.body?.entries) ? req.body.entries : [];
  if (!submitted.length || submitted.length > MAX_ROSTER_SIZE) return res.status(400).json({ message: 'Submit marks for between 1 and 500 children at a time.' });
  const today = getTodayInTimeZone(req.tenant.branch.timezone || req.tenant.organization.timezone || 'Asia/Kolkata');
  const entries = [];
  const ids = [];
  const errors = [];
  for (const [index, entry] of submitted.entries()) {
    const result = validateMarkEntry(entry, index, today || new Date().toISOString().slice(0, 10));
    if (!result.valid) errors.push(...result.errors);
    entries.push(result.value);
    ids.push(result.value.studentId);
  }
  if (errors.length) return res.status(400).json({ message: 'Please correct the subject marks.', errors: [...new Set(errors)].slice(0, 40) });
  if (ids.some((id) => !validReportId(id)) || new Set(ids).size !== ids.length) {
    return res.status(400).json({ message: 'The submitted marks contain an invalid or repeated child.' });
  }

  try {
    const updated = await withTransaction(async (session) => {
      const report = await reportById(req, req.params.id, false, session);
      if (!report) {
        const missing = new Error('Report card not found in this branch.');
        missing.code = 'REPORT_NOT_FOUND';
        throw missing;
      }
      if (!canAccessClass(req, report.standard)) {
        const forbidden = new Error('You do not have access to this class.');
        forbidden.code = 'CLASS_ACCESS_DENIED';
        throw forbidden;
      }

      const rosterIds = new Set((report.students || []).map((studentId) => String(studentId)));
      if (entries.some((entry) => !rosterIds.has(entry.studentId))) {
        const outsideRoster = new Error('Every selected child must belong to this report-card roster.');
        outsideRoster.code = 'CHILD_OUTSIDE_REPORT_ROSTER';
        throw outsideRoster;
      }

      const children = await Student.find({
        _id: { $in: ids },
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        standard: report.standard,
      }).session(session);
      if (children.length !== ids.length) {
        const mismatch = new Error('One or more children do not belong to this report’s branch and class.');
        mismatch.code = 'CHILD_SCOPE_MISMATCH';
        throw mismatch;
      }

      const childById = new Map(children.map((child) => [String(child._id), child]));
      for (const entry of entries) {
        const child = childById.get(entry.studentId);
        const newMark = {
          reportId: report._id,
          subjectData: entry.subjectData,
          total: entry.total,
          percentage: entry.percentage,
          grade: entry.grade,
        };
        const existingIndex = child.marks.findIndex((mark) => String(mark.reportId) === String(report._id));
        if (existingIndex >= 0) child.marks[existingIndex] = newMark;
        else child.marks.push(newMark);
        child.markModified('marks');
        await child.save({ session });
      }

      await writeAudit(req, session, {
        action: 'report_card.marks_saved',
        report,
        summary: 'Marks saved for ' + entries.length + ' student(s) in ' + report.reportName + '.',
        changedFields: ['studentMarks'],
      });
      return { report, changed: entries.length };
    });

    return res.json({ message: 'Report-card marks saved.', reportId: String(updated.report._id), updatedStudents: updated.changed });
  } catch (error) {
    if (error.code === 'REPORT_NOT_FOUND') return res.status(404).json({ message: error.message });
    if (error.code === 'CLASS_ACCESS_DENIED') return res.status(403).json({ message: error.message });
    if (['CHILD_OUTSIDE_REPORT_ROSTER', 'CHILD_SCOPE_MISMATCH'].includes(error.code)) return res.status(400).json({ message: error.message });
    console.error('Unable to save report-card marks:', error.message);
    return res.status(503).json({ message: 'Marks could not be saved safely.' });
  }
});

router.patch('/:id/archive', requireBranchContext, async (req, res) => {
  if (!allowed(req, MANAGE_ROLES, res)) return;
  if (!validReportId(req.params.id)) return res.status(400).json({ message: 'Choose a valid report card.' });
  const reason = clean(req.body?.reason, 500);
  if (reason.length < 3) return res.status(400).json({ message: 'Enter a reason before archiving a report card.' });
  try {
    const result = await withTransaction(async (session) => {
      const report = await reportById(req, req.params.id, false, session);
      if (!report) {
        const missing = new Error('Report card not found in this branch.');
        missing.code = 'REPORT_NOT_FOUND';
        throw missing;
      }
      report.status = 'archived';
      report.archivedAt = new Date();
      report.archivedBy = req.user._id;
      report.updatedBy = req.user._id;
      report.updatedAt = new Date();
      await report.save({ session });
      await writeAudit(req, session, {
        action: 'report_card.archived',
        report,
        summary: 'Report card archived: ' + report.reportName + '.',
        changedFields: ['status'],
        reason,
      });
      return report;
    });
    return res.json({ message: 'Report card archived.', report: serializeReport(result) });
  } catch (error) {
    if (error.code === 'REPORT_NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to archive report card:', error.message);
    return res.status(503).json({ message: 'Report card could not be archived safely.' });
  }
});

router.get('/:id/export.csv', requireBranchContext, async (req, res) => {
  if (!allowed(req, [...MANAGE_ROLES, 'teacher'], res)) return;
  try {
    const report = await reportById(req, req.params.id);
    if (!report) return res.status(404).json({ message: 'Report card not found in this branch.' });
    if (!canAccessClass(req, report.standard)) return res.status(403).json({ message: 'You do not have access to this class.' });
    const roster = await getScopedRoster(req, report.toObject());
    const rows = roster.map((student) => {
      const mark = (student.marks || []).find((item) => String(item.reportId) === String(report._id));
      const subjectText = (mark?.subjectData || []).map((item) => item.subject + ': ' + item.mark).join('; ');
      return [
        student.stuNo || '',
        childName(student),
        student.standard || '',
        subjectText,
        mark?.total ?? '',
        mark?.percentage ?? '',
        mark?.grade || '',
      ];
    });
    const csv = createCsv(['Admission number', 'Student name', 'Class', 'Subjects and marks', 'Total', 'Percentage', 'Grade'], rows);
    await writeAudit(req, null, {
      action: 'report.exported',
      report,
      summary: 'Report-card CSV exported: ' + report.reportName + '.',
      changedFields: ['reportCardCsv'],
    });
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + ('report-card-' + report._id + '.csv') + '"',
      'Cache-Control': 'private, no-store',
    });
    return res.send(csv);
  } catch (error) {
    console.error('Unable to export report card:', error.message);
    return res.status(503).json({ message: 'The report card could not be exported.' });
  }
});

module.exports = router;
