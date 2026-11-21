'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseClockTime, validateDailyWorkReport } = require('../utils/dailyWorkReportValidation');

const validReport = {
  TimeIn: '09:00',
  TimeOut: '13:30',
  subject: 'Phonics',
  standard: 'ENG JR.',
  branch: 'Main',
  dailyWorkReport: 'Practised letter sounds and reading.',
  totalStudents: 18,
};

test('validates a teacher work report and normalizes fields', () => {
  const result = validateDailyWorkReport(validReport, 'ENG JR.');
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, validReport);
  assert.equal(parseClockTime('09:30'), 570);
});

test('rejects invalid times and non-positive working duration', () => {
  assert.equal(validateDailyWorkReport({ ...validReport, TimeIn: '9:00' }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, TimeOut: '09:00' }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, TimeOut: '25:00' }).valid, false);
});

test('rejects out-of-scope class submissions', () => {
  const result = validateDailyWorkReport({ ...validReport, standard: 'ENG SR.' }, 'ENG JR.');
  assert.equal(result.valid, false);
  assert.equal(result.code, 'TEACHER_CLASS_FORBIDDEN');
  assert.equal(validateDailyWorkReport(validReport, '').valid, true);
});

test('bounds report text and student count', () => {
  assert.equal(validateDailyWorkReport({ ...validReport, dailyWorkReport: 'tiny' }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, dailyWorkReport: 'x'.repeat(2001) }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, totalStudents: -1 }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, totalStudents: 501 }).valid, false);
  assert.equal(validateDailyWorkReport({ ...validReport, totalStudents: 2.5 }).valid, false);
});
