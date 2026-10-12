'use strict';

const MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin'];
const REPORT_READ_ROLES = [...MANAGER_ROLES, 'teacher'];
const REPORT_REVIEW_ROLES = MANAGER_ROLES;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isActiveInRole(membership, roles) {
  return Boolean(membership && membership.status === 'active' && roles.includes(membership.role));
}

function canReadWorkReports(membership) {
  return isActiveInRole(membership, REPORT_READ_ROLES);
}

function canReviewWorkReports(membership) {
  return isActiveInRole(membership, REPORT_REVIEW_ROLES);
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function timeToMinutes(value) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return null;
  const parts = value.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

function validateWorkReportInput(input = {}) {
  const reportDate = cleanText(input.reportDate || input.date, 10);
  const className = cleanText(input.className || input.standard, 80);
  const subject = cleanText(input.subject, 100);
  const startTime = cleanText(input.startTime || input.TimeIn, 5);
  const endTime = cleanText(input.endTime || input.TimeOut, 5);
  const workSummary = cleanText(input.workSummary || input.dailyWorkReport, 5000);
  const studentsPresent = Number(input.studentsPresent ?? input.totalStudents);
  const errors = {};

  if (!DATE_PATTERN.test(reportDate)) errors.reportDate = 'Choose a valid report date.';
  else {
    const date = new Date(reportDate + 'T00:00:00.000Z');
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== reportDate) {
      errors.reportDate = 'Choose a real calendar date.';
    }
  }
  if (className.length < 2) errors.className = 'Choose a class assigned to you.';
  if (subject.length < 2) errors.subject = 'Enter the subject or classroom activity.';
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null) errors.startTime = 'Enter a valid start time in 24-hour format.';
  if (endMinutes === null) errors.endTime = 'Enter a valid end time in 24-hour format.';
  const durationMinutes = startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : 0;
  if (startMinutes !== null && endMinutes !== null && (durationMinutes < 1 || durationMinutes > 840)) {
    errors.endTime = 'End time must be after start time and the report cannot exceed 14 hours.';
  }
  if (workSummary.length < 10) errors.workSummary = 'Describe the classroom work in at least 10 characters.';
  if (!Number.isInteger(studentsPresent) || studentsPresent < 0 || studentsPresent > 1000) {
    errors.studentsPresent = 'Students present must be a whole number from 0 to 1000.';
  }

  if (Object.keys(errors).length) return { valid: false, errors, message: Object.values(errors)[0] };
  return {
    valid: true,
    value: {
      reportDate,
      className,
      subject,
      startTime,
      endTime,
      durationMinutes,
      workSummary,
      studentsPresent,
    },
  };
}

function validateReportRange(fromValue, toValue, maxDays = 92) {
  const from = cleanText(fromValue, 10);
  const to = cleanText(toValue, 10);
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return { valid: false, message: 'Choose a valid start and end date.' };
  }
  const fromDate = new Date(from + 'T00:00:00.000Z');
  const toDate = new Date(to + 'T00:00:00.000Z');
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) ||
      fromDate.toISOString().slice(0, 10) !== from || toDate.toISOString().slice(0, 10) !== to) {
    return { valid: false, message: 'Choose real calendar dates.' };
  }
  if (toDate < fromDate) return { valid: false, message: 'The end date must be on or after the start date.' };
  if (toDate.getTime() - fromDate.getTime() > (maxDays - 1) * 24 * 60 * 60 * 1000) {
    return { valid: false, message: 'Choose a date range of ' + maxDays + ' days or fewer.' };
  }
  return { valid: true, from, to };
}

function canTeacherAccessClass(membership, className) {
  if (!membership || membership.status !== 'active') return false;
  if (membership.role !== 'teacher') return false;
  const assigned = Array.isArray(membership.classNames) ? membership.classNames : [];
  return assigned.includes(className);
}

function reviewTransition(status, reviewStatus, reviewNote) {
  if (!['submitted', 'reviewed', 'needs_follow_up'].includes(status)) {
    return { valid: false, message: 'This report is not in a reviewable state.' };
  }
  if (!['reviewed', 'needs_follow_up'].includes(reviewStatus)) {
    return { valid: false, message: 'Choose Reviewed or Needs follow-up.' };
  }
  const note = cleanText(reviewNote, 1000);
  if (reviewStatus === 'needs_follow_up' && note.length < 3) {
    return { valid: false, message: 'Add a short note explaining what needs follow-up.' };
  }
  return { valid: true, status: reviewStatus, reviewNote: note };
}

module.exports = {
  MANAGER_ROLES,
  REPORT_READ_ROLES,
  REPORT_REVIEW_ROLES,
  isActiveInRole,
  canReadWorkReports,
  canReviewWorkReports,
  timeToMinutes,
  validateWorkReportInput,
  validateReportRange,
  canTeacherAccessClass,
  reviewTransition,
};
