'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canManageStaffAttendance,
  canReviewStaffLeave,
  canSelfPunch,
  validateLeaveInput,
  validateLeaveDecision,
  decideCheckIn,
  decideCheckOut,
} = require('../utils/staffOperationsPolicy');

test('only authorized active managers can edit staff attendance or decide leave', () => {
  assert.equal(canManageStaffAttendance({ status: 'active', role: 'hr_manager' }), true);
  assert.equal(canManageStaffAttendance({ status: 'active', role: 'teacher' }), false);
  assert.equal(canReviewStaffLeave({ status: 'suspended', role: 'branch_admin' }), false);
  assert.equal(canReviewStaffLeave({ status: 'active', role: 'head_office_admin' }), true);
  assert.equal(canSelfPunch({ status: 'active', role: 'teacher' }), true);
  assert.equal(canSelfPunch({ status: 'active', role: 'parent' }), false);
});

test('leave request validation accepts a valid full-day range and one half-day', () => {
  const full = validateLeaveInput({
    leaveType: 'sick',
    startDate: '2026-10-14',
    endDate: '2026-10-15',
    partialDay: 'full',
    reason: 'Doctor appointment and recovery.',
  }, '2026-10-12');
  assert.equal(full.valid, true);
  assert.equal(full.value.requestedDays, 2);

  const half = validateLeaveInput({
    leaveType: 'personal',
    startDate: '2026-10-14',
    endDate: '2026-10-14',
    partialDay: 'first_half',
    reason: 'Family appointment outside school.',
  }, '2026-10-12');
  assert.equal(half.valid, true);
  assert.equal(half.value.requestedDays, 0.5);
});

test('leave request validation rejects past dates, invalid intervals and long ranges', () => {
  assert.equal(validateLeaveInput({
    leaveType: 'annual', startDate: '2026-10-11', endDate: '2026-10-11',
    reason: 'Planned personal leave.',
  }, '2026-10-12').valid, false);
  assert.equal(validateLeaveInput({
    leaveType: 'annual', startDate: '2026-10-16', endDate: '2026-10-15',
    reason: 'Planned personal leave.',
  }, '2026-10-12').valid, false);
  assert.equal(validateLeaveInput({
    leaveType: 'annual', startDate: '2026-10-12', endDate: '2027-02-01',
    reason: 'Planned personal leave for many days.',
  }, '2026-10-12').valid, false);
});

test('leave rejection needs a reason and only pending requests can be decided', () => {
  assert.equal(validateLeaveDecision('pending', 'rejected', '').valid, false);
  assert.deepEqual(validateLeaveDecision('pending', 'approved', ''), {
    valid: true, status: 'approved', decisionNote: '',
  });
  assert.equal(validateLeaveDecision('approved', 'rejected', 'Changed mind').valid, false);
});

test('staff attendance punches prevent duplicate check-in and premature check-out', () => {
  assert.deepEqual(decideCheckIn(null), { allowed: true, action: 'create' });
  assert.equal(decideCheckIn({ checkInAt: new Date() }).code, 'ALREADY_CHECKED_IN');
  assert.equal(decideCheckIn({ status: 'on_leave', checkInAt: null }).code, 'ATTENDANCE_LOCKED');
  assert.equal(decideCheckOut(null).code, 'CHECK_IN_REQUIRED');
  assert.equal(decideCheckOut({ checkInAt: new Date(), checkOutAt: new Date() }).code, 'ALREADY_CHECKED_OUT');
  assert.equal(decideCheckOut({ checkInAt: new Date(), checkOutAt: null, status: 'present' }).allowed, true);
});
