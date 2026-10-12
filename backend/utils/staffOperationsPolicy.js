'use strict';

const { parseDateOnly } = require('./dateOnly');

const STAFF_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions', 'teacher', 'accountant', 'hr_manager', 'transport_staff'];
const ATTENDANCE_MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'hr_manager'];
const LEAVE_REVIEW_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin', 'hr_manager'];
const ATTENDANCE_STATUSES = ['present', 'late', 'half_day', 'absent', 'on_leave'];
const LEAVE_TYPES = ['annual', 'sick', 'personal', 'family', 'unpaid', 'other'];
const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function activeRole(membership, roles) {
  return Boolean(membership && membership.status === 'active' && roles.includes(membership.role));
}

function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

function canManageStaffAttendance(membership) {
  return activeRole(membership, ATTENDANCE_MANAGER_ROLES);
}

function canReviewStaffLeave(membership) {
  return activeRole(membership, LEAVE_REVIEW_ROLES);
}

function validateDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  return Boolean(parseDateOnly(value));
}

function validateLeaveInput(input = {}, today) {
  const leaveType = typeof input.leaveType === 'string' ? input.leaveType.trim() : '';
  const startDate = typeof input.startDate === 'string' ? input.startDate.trim() : '';
  const endDate = typeof input.endDate === 'string' ? input.endDate.trim() : '';
  const partialDay = ['full', 'first_half', 'second_half'].includes(input.partialDay) ? input.partialDay : 'full';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  const errors = {};

  if (!LEAVE_TYPES.includes(leaveType)) errors.leaveType = 'Choose a valid leave type.';
  if (!validateDate(startDate)) errors.startDate = 'Choose a real leave start date.';
  if (!validateDate(endDate)) errors.endDate = 'Choose a real leave end date.';
  if (validateDate(startDate) && validateDate(endDate)) {
    if (endDate < startDate) errors.endDate = 'Leave end date must be on or after the start date.';
    if (endDate < (today || '0000-00-00')) errors.startDate = 'Leave requests cannot start wholly in the past.';
    if (startDate < (today || '0000-00-00')) errors.startDate = 'Leave cannot be requested retroactively.';
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (dayCount > 90) errors.endDate = 'A leave request cannot exceed 90 calendar days.';
    if (partialDay !== 'full' && startDate !== endDate) errors.partialDay = 'Half-day leave must start and end on the same date.';
  }
  if (reason.length < 10 || reason.length > 1000) errors.reason = 'Explain the reason in 10 to 1000 characters.';

  if (Object.keys(errors).length) return { valid: false, errors, message: Object.values(errors)[0] };
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  const requestedDays = partialDay === 'full'
    ? Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    : 0.5;
  return {
    valid: true,
    value: { leaveType, startDate, endDate, partialDay, requestedDays, reason },
  };
}

function validateLeaveDecision(currentStatus, requestedStatus, decisionNote) {
  if (currentStatus !== 'pending') {
    return { valid: false, message: 'Only pending leave requests can be approved or rejected.' };
  }
  if (!['approved', 'rejected'].includes(requestedStatus)) {
    return { valid: false, message: 'Choose Approve or Reject.' };
  }
  const note = typeof decisionNote === 'string' ? decisionNote.trim().slice(0, 1000) : '';
  if (requestedStatus === 'rejected' && note.length < 3) {
    return { valid: false, message: 'Add a short reason before rejecting a leave request.' };
  }
  return { valid: true, status: requestedStatus, decisionNote: note };
}

function canSelfPunch(membership) {
  return activeRole(membership, STAFF_ROLES.filter((role) => !['organization_owner', 'head_office_admin', 'branch_admin'].includes(role)));
}

function decideCheckIn(record) {
  if (!record) return { allowed: true, action: 'create' };
  if (record.checkInAt) return { allowed: false, code: 'ALREADY_CHECKED_IN', message: 'You have already checked in for this school day.' };
  if (record.status === 'absent' || record.status === 'on_leave') {
    return { allowed: false, code: 'ATTENDANCE_LOCKED', message: 'Your attendance was marked absent or on leave. Contact your manager to correct it.' };
  }
  return { allowed: true, action: 'update' };
}

function decideCheckOut(record) {
  if (!record || !record.checkInAt) {
    return { allowed: false, code: 'CHECK_IN_REQUIRED', message: 'Check in must be recorded before you can check out.' };
  }
  if (record.checkOutAt) {
    return { allowed: false, code: 'ALREADY_CHECKED_OUT', message: 'You have already checked out for this school day.' };
  }
  if (record.status === 'absent' || record.status === 'on_leave') {
    return { allowed: false, code: 'ATTENDANCE_LOCKED', message: 'Attendance is marked absent or on leave. Contact your manager.' };
  }
  return { allowed: true };
}

module.exports = {
  STAFF_ROLES,
  ATTENDANCE_MANAGER_ROLES,
  LEAVE_REVIEW_ROLES,
  ATTENDANCE_STATUSES,
  LEAVE_TYPES,
  LEAVE_STATUSES,
  activeRole,
  isStaffRole,
  canManageStaffAttendance,
  canReviewStaffLeave,
  validateDate,
  validateLeaveInput,
  validateLeaveDecision,
  canSelfPunch,
  decideCheckIn,
  decideCheckOut,
};
