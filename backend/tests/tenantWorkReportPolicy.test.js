'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canReadWorkReports,
  canReviewWorkReports,
  validateWorkReportInput,
  validateReportRange,
  canTeacherAccessClass,
  reviewTransition,
} = require('../utils/tenantWorkReportPolicy');

const report = {
  reportDate: '2026-10-12',
  className: 'Nursery',
  subject: 'Early literacy',
  startTime: '09:00',
  endTime: '12:30',
  workSummary: 'Practised alphabet sounds, read a short story and completed a guided tracing activity.',
  studentsPresent: 18,
};

test('only active teachers and school managers can read reports; only managers review', () => {
  assert.equal(canReadWorkReports({ status: 'active', role: 'teacher' }), true);
  assert.equal(canReadWorkReports({ status: 'active', role: 'branch_admin' }), true);
  assert.equal(canReadWorkReports({ status: 'suspended', role: 'teacher' }), false);
  assert.equal(canReviewWorkReports({ status: 'active', role: 'branch_admin' }), true);
  assert.equal(canReviewWorkReports({ status: 'active', role: 'teacher' }), false);
});

test('work report validation computes duration and trims content', () => {
  const result = validateWorkReportInput({ ...report, subject: ' Early literacy ' });
  assert.equal(result.valid, true);
  assert.equal(result.value.durationMinutes, 210);
  assert.equal(result.value.subject, 'Early literacy');
});

test('report validation rejects invalid dates, time order, summary and student counts', () => {
  assert.equal(validateWorkReportInput({ ...report, reportDate: '2026-02-30' }).valid, false);
  assert.equal(validateWorkReportInput({ ...report, startTime: '13:00', endTime: '12:00' }).valid, false);
  assert.equal(validateWorkReportInput({ ...report, workSummary: 'Short' }).valid, false);
  assert.equal(validateWorkReportInput({ ...report, studentsPresent: 1.5 }).valid, false);
});

test('date ranges use real dates, inclusive day limits and ordered endpoints', () => {
  assert.equal(validateReportRange('2026-10-01', '2026-10-31').valid, true);
  assert.equal(validateReportRange('2026-10-31', '2026-10-01').valid, false);
  assert.equal(validateReportRange('2026-02-30', '2026-03-01').valid, false);
  assert.equal(validateReportRange('2026-01-01', '2026-04-10').valid, false);
});

test('teachers can submit reports only for classes assigned to their active membership', () => {
  const teacher = { status: 'active', role: 'teacher', classNames: ['Nursery', 'Jr KG'] };
  assert.equal(canTeacherAccessClass(teacher, 'Nursery'), true);
  assert.equal(canTeacherAccessClass(teacher, 'Sr KG'), false);
  assert.equal(canTeacherAccessClass({ ...teacher, status: 'suspended' }, 'Nursery'), false);
  assert.equal(canTeacherAccessClass({ status: 'active', role: 'branch_admin', classNames: ['Nursery'] }, 'Nursery'), false);
});

test('reviewed reports are locked against later state changes', () => {
  assert.equal(reviewTransition('reviewed', 'needs_follow_up', 'Please clarify').valid, false);
  assert.equal(reviewTransition('needs_follow_up', 'reviewed', 'Resolved').valid, false);
});

test('review decisions require a clear follow-up note when action is needed', () => {
  assert.equal(reviewTransition('submitted', 'reviewed', '').valid, true);
  assert.equal(reviewTransition('submitted', 'needs_follow_up', '').valid, false);
  assert.deepEqual(reviewTransition('submitted', 'needs_follow_up', 'Please add activity details.'), {
    valid: true,
    status: 'needs_follow_up',
    reviewNote: 'Please add activity details.',
  });
  assert.equal(reviewTransition('reviewed', 'needs_follow_up', 'Clarify this report').valid, false);
});
