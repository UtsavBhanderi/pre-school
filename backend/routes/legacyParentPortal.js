'use strict';

const express = require('express');
const ParentAccount = require('../models/ParentAccount');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Fees = require('../models/Fee');
const Announcement = require('../models/Announcement');
const Calendar = require('../models/Calendar');
const ReportCard = require('../models/ReportCard');
const User = require('../models/User');
const { parseDateOnly } = require('../utils/dateOnly');
const { getTodayInTimeZone } = require('../utils/zonedDate');
const { isValidNewPassword } = require('../utils/passwordResetTokens');
const { buildCalendarStandardVisibilityFilter } = require('../utils/calendarStandardVisibility');

const router = express.Router();

function requireParentAccount(req, res, next) {
  if (!req.user?._id) return res.status(401).json({ message: 'Sign in to access your family portal.' });
  if (req.user.role !== 'parent') {
    return res.status(403).json({ message: 'The family portal is available only to parent accounts.' });
  }
  ParentAccount.findOne({ userId: req.user._id }).select('studentIds').lean()
    .then((account) => {
      if (!account || !Array.isArray(account.studentIds) || !account.studentIds.length) {
        return res.status(403).json({ code: 'PARENT_ACCESS_INACTIVE', message: 'Parent portal access is not active. Contact the preschool office.' });
      }
      req.parentAccount = account;
      return next();
    })
    .catch((error) => {
      console.error('Unable to verify parent account:', error?.name || 'account_error');
      return res.status(503).json({ message: 'Your family access could not be verified.' });
    });
}

function childName(student) {
  return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ').trim();
}

function getRange(fromValue, toValue, defaultDays = 30) {
  const to = toValue ? parseDateOnly(toValue) : new Date();
  if (!to || Number.isNaN(to.getTime())) return null;
  const toDate = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  const from = fromValue ? parseDateOnly(fromValue) : new Date(toDate);
  if (!from || Number.isNaN(from.getTime())) return null;
  const fromDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (!fromValue) fromDate.setUTCDate(fromDate.getUTCDate() - (defaultDays - 1));
  if (fromDate > toDate || (toDate - fromDate) / 86400000 > 90) return null;
  const endExclusive = new Date(toDate);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { from: fromDate, to: toDate, endExclusive };
}

async function getChildren(req) {
  return Student.find({
    _id: { $in: req.parentAccount.studentIds },
    $or: [{ organizationId: null }, { organizationId: { $exists: false } }],
  })
    .select('_id firstName middleName lastName stuNo standard batchYear dob gender address parentEmail studentPhoto')
    .sort({ standard: 1, middleName: 1, lastName: 1 })
    .lean();
}

const studentSummary = (student) => ({
  id: String(student._id),
  name: childName(student),
  admissionNumber: student.stuNo || '',
  className: student.standard || '',
  academicYear: student.batchYear || '',
  dateOfBirth: student.dob || '',
  gender: student.gender || '',
  address: student.address || '',
});

router.get('/summary', requireParentAccount, async (req, res) => {
  try {
    const children = await getChildren(req);
    const ids = children.map((child) => child._id);
    // Attendance is stored against UTC calendar-day keys, while the
    // school day is determined from the configured school timezone.
    const today = getTodayInTimeZone(process.env.SCHOOL_TIME_ZONE || 'Asia/Kolkata');
    const start = today ? parseDateOnly(today) : null;
    if (!start) return res.status(500).json({ message: 'The school timezone is not configured correctly.' });
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const attendance = ids.length ? await Attendance.find({
      organizationId: null,
      date: { $gte: start, $lt: end },
      'studentDetails.studentId': { $in: ids },
    }).sort({ updatedAt: -1, createdAt: -1, _id: -1 }).select('studentDetails').lean() : [];

    const visibleChildIds = new Set(ids.map((id) => String(id)));
    const attendanceByChild = new Map();
    for (const record of attendance) {
      for (const detail of record.studentDetails || []) {
        const key = String(detail.studentId);
        if (visibleChildIds.has(key) && !attendanceByChild.has(key)) {
          attendanceByChild.set(key, detail.status);
        }
      }
    }

    const stuNumbers = children.map((child) => child.stuNo).filter(Boolean);
    const feeRows = stuNumbers.length ? await Fees.find({
      organizationId: null,
      stuNo: { $in: stuNumbers },
    }).select('stuNo totalFeesRemaining totalStandardFees totalFeesPaid discount').lean() : [];
    const feeByStuNo = new Map(feeRows.map((fee) => [String(fee.stuNo), fee]));
    const outstanding = children.reduce((sum, child) => {
      const fee = feeByStuNo.get(String(child.stuNo || ''));
      if (!fee) return sum;
      const calculated = Math.max(0,
        Number(fee.totalStandardFees || 0) - Number(fee.totalFeesPaid || 0) - Number(fee.discount || 0));
      return sum + Math.max(0, Number(fee.totalFeesRemaining ?? calculated));
    }, 0);

    return res.json({
      schoolName: String(process.env.SINGLE_SCHOOL_NAME || 'Pre-School').trim(),
      date: today,
      children: children.length,
      attendanceToday: {
        present: [...attendanceByChild.values()].filter((value) => value === 'present').length,
        absent: [...attendanceByChild.values()].filter((value) => value === 'absent').length,
      },
      fees: { outstanding, currency: 'INR' },
      childSummaries: children.map((child) => ({
        ...studentSummary(child),
        attendanceToday: attendanceByChild.get(String(child._id)) || 'not_recorded',
      })),
    });
  } catch (error) {
    console.error('Unable to load standalone parent summary:', error?.name || 'summary_error');
    return res.status(503).json({ message: 'Your family summary could not be loaded.' });
  }
});

router.get('/children', requireParentAccount, async (req, res) => {
  try {
    const children = await getChildren(req);
    return res.json({ total: children.length, children: children.map(studentSummary) });
  } catch (error) {
    console.error('Unable to load standalone parent children:', error?.name || 'children_error');
    return res.status(503).json({ message: 'Your children could not be loaded.' });
  }
});

router.get('/attendance', requireParentAccount, async (req, res) => {
  const range = getRange(req.query.from, req.query.to, 30);
  if (!range) return res.status(400).json({ message: 'Choose a valid date range of 91 days or less.' });
  try {
    const children = await getChildren(req);
    const childById = new Map(children.map((child) => [String(child._id), child]));
    const records = children.length ? await Attendance.find({
      organizationId: null,
      date: { $gte: range.from, $lt: range.endExclusive },
      'studentDetails.studentId': { $in: children.map((child) => child._id) },
    }).sort({ date: -1, updatedAt: -1, createdAt: -1, _id: -1 })
      .select('date standard studentDetails updatedAt createdAt').limit(1000).lean() : [];
    const grouped = new Map(children.map((child) => [String(child._id), []]));
    const seenChildDays = new Set();
    for (const record of records) {
      const dateKey = record.date ? new Date(record.date).toISOString().slice(0, 10) : '';
      for (const detail of record.studentDetails || []) {
        const key = String(detail.studentId);
        if (!childById.has(key) || !dateKey) continue;
        const childDayKey = key + ':' + dateKey;
        if (seenChildDays.has(childDayKey)) continue;
        seenChildDays.add(childDayKey);
        grouped.get(key).push({
          date: record.date,
          status: detail.status,
          reason: detail.status === 'absent' ? String(detail.reason || '') : '',
          className: record.standard || childById.get(key).standard || '',
        });
      }
    }
    return res.json({
      from: range.from.toISOString().slice(0, 10),
      to: range.to.toISOString().slice(0, 10),
      children: children.map((child) => ({
        child: studentSummary(child),
        records: grouped.get(String(child._id)) || [],
      })),
    });
  } catch (error) {
    console.error('Unable to load standalone parent attendance:', error?.name || 'attendance_error');
    return res.status(503).json({ message: 'Attendance history could not be loaded.' });
  }
});

router.get('/fees', requireParentAccount, async (req, res) => {
  try {
    const children = await getChildren(req);
    const stuNumbers = children.map((child) => child.stuNo).filter(Boolean);
    const feeRows = stuNumbers.length ? await Fees.find({
      organizationId: null,
      stuNo: { $in: stuNumbers },
    }).sort({ stuNo: 1 }).lean() : [];
    const childByStuNo = new Map(children.map((child) => [String(child.stuNo), child]));
    return res.json({
      fees: feeRows.map((fee) => {
        const standard = Number(fee.totalStandardFees || 0);
        const paid = Number(fee.totalFeesPaid || 0);
        const discount = Number(fee.discount || 0);
        const remaining = Math.max(0, Number(fee.totalFeesRemaining ?? (standard - paid - discount)));
        return {
          id: String(fee._id),
          child: studentSummary(childByStuNo.get(String(fee.stuNo)) || {}),
          total: standard,
          paid,
          discount,
          outstanding: remaining,
          payments: (fee.paymentDetails || []).map((payment) => ({
            date: payment.date || '',
            time: payment.time || '',
            amount: Number(payment.amount || 0),
          })),
        };
      }),
    });
  } catch (error) {
    console.error('Unable to load standalone parent fees:', error?.name || 'fees_error');
    return res.status(503).json({ message: 'Fee details could not be loaded.' });
  }
});

router.get('/notices', requireParentAccount, async (req, res) => {
  try {
    const now = new Date();
    const notices = await Announcement.find({
      isActive: true,
      audience: { $in: ['all', 'both', 'parents'] },
      startsAt: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
    }).select('title message priority startsAt expiresAt createdAt createdByName')
      .sort({ priority: -1, createdAt: -1 }).limit(100).lean();
    return res.json({ notices });
  } catch (error) {
    console.error('Unable to load standalone parent notices:', error?.name || 'notices_error');
    return res.status(503).json({ message: 'School notices could not be loaded.' });
  }
});

router.get('/calendar', requireParentAccount, async (req, res) => {
  const range = getRange(req.query.from, req.query.to, 90);
  if (!range) return res.status(400).json({ message: 'Choose a valid school calendar date range.' });
  try {
    const children = await getChildren(req);
    const childStandards = [...new Set(children.map((child) => String(child.standard || '').trim()).filter(Boolean))];
    const events = await Calendar.find({
      start: { $lt: range.endExclusive },
      $and: [
        { $or: [{ end: null }, { end: { $gte: range.from } }] },
        // Old events without an audience keep their previous Everyone visibility.
        { $or: [{ audience: { $in: ['all', 'parents'] } }, { audience: { $exists: false } }] },
        buildCalendarStandardVisibilityFilter(childStandards),
      ],
    }).select('title start end color audience standards').sort({ start: 1 }).limit(250).lean();
    return res.json({ events: events.map((event) => ({
      id: String(event._id),
      title: event.title || 'School event',
      startsAt: event.start || null,
      endsAt: event.end || event.start || null,
      color: event.color || '',
      audience: event.audience || 'all',
      standards: Array.isArray(event.standards) ? event.standards : [],
    })) });
  } catch (error) {
    console.error('Unable to load standalone parent calendar:', error?.name || 'calendar_error');
    return res.status(503).json({ message: 'The school calendar could not be loaded.' });
  }
});

router.get('/reports', requireParentAccount, async (req, res) => {
  try {
    const children = await getChildren(req);
    const reports = children.length ? await ReportCard.find({
      $or: [{ publishedAt: { $type: 'date' } }, { publishedAt: { $exists: false } }],
      students: { $in: children.map((child) => child._id) },
    }).select('reportName standard description createdAt publishedAt students')
      .populate({ path: 'students', select: 'firstName middleName lastName stuNo' })
      .sort({ createdAt: -1 }).limit(100).lean() : [];
    const allowedIds = new Set(children.map((child) => String(child._id)));
    const progressRows = children.length ? await Student.find({
      _id: { $in: children.map((child) => child._id) },
    }).select('_id marks').lean() : [];
    const progressByChild = new Map(progressRows.map((student) => [String(student._id), student.marks || []]));
    const publishedReports = reports.map((report) => {
      // A report becomes visible to a family only after that child's marks
      // have been saved. Opening a class roster must not expose an empty
      // assessment card in the parent portal.
      const publishedChildren = (report.students || [])
        .filter((student) => allowedIds.has(String(student._id)))
        .map((student) => {
          const result = (progressByChild.get(String(student._id)) || [])
            .find((entry) => String(entry.reportId?._id || entry.reportId) === String(report._id));
          if (!result) return null;
          return {
            id: String(student._id),
            name: childName(student),
            admissionNumber: student.stuNo || '',
            result: {
              total: Number(result.total || 0),
              percentage: Number(result.percentage || 0),
              grade: result.grade || '',
              subjects: (result.subjectData || []).map((subject) => ({
                subject: subject.subject || 'Subject',
                mark: Number(subject.mark || 0),
                date: subject.date || '',
              })),
            },
          };
        })
        .filter(Boolean);
      return {
        id: String(report._id),
        title: report.reportName || 'Student report',
        className: report.standard || '',
        description: report.description || '',
        createdAt: report.createdAt,
        children: publishedChildren,
      };
    }).filter((report) => report.children.length > 0);
    return res.json({ reports: publishedReports });
  } catch (error) {
    console.error('Unable to load standalone parent reports:', error?.name || 'reports_error');
    return res.status(503).json({ message: 'Learning reports could not be loaded.' });
  }
});

router.post('/change-password', requireParentAccount, async (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (!isValidNewPassword(newPassword)) {
    return res.status(400).json({ message: 'Choose a new password between 12 and 128 characters.' });
  }
  try {
    const user = await User.findById(req.user._id);
    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Your current password is incorrect.' });
    }
    user.password = newPassword;
    user.authVersion = (Number.isInteger(user.authVersion) ? user.authVersion : 0) + 1;
    await user.save();
    return res.json({ message: 'Password changed. Please sign in again with your new password.' });
  } catch (error) {
    console.error('Unable to change standalone parent password:', error?.name || 'password_error');
    return res.status(503).json({ message: 'Your password could not be changed safely.' });
  }
});

module.exports = router;
