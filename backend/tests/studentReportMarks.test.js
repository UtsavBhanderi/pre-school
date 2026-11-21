'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidDateOnly, validateStudentReportMarks, calculateStudentReportResult } = require('../utils/studentReportMarks');

const subjects = ['English', 'Maths', 'Gujarati'];
const validData = [
  { subject: 'English', mark: 9.5, date: '2026-11-20' },
  { subject: 'Maths', mark: 10, date: '2026-11-20' },
  { subject: 'Gujarati', mark: 8, date: '' },
];

test('accepts a complete subject set and normalizes marks', () => {
  const result = validateStudentReportMarks(validData, subjects, '10');
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, validData);
});

test('rejects marks above the subject maximum, negative marks and excess precision', () => {
  for (const mark of [10.01, -0.01, 'NaN', 'Infinity', 2.345]) {
    const data = validData.map((item, index) => index === 0 ? { ...item, mark } : item);
    assert.equal(validateStudentReportMarks(data, subjects, 10).valid, false);
  }
});

test('rejects unknown, duplicate, omitted and malformed subjects', () => {
  assert.equal(validateStudentReportMarks([{ ...validData[0], subject: 'Art' }, ...validData.slice(1)], subjects, 10).valid, false);
  assert.equal(validateStudentReportMarks([validData[0], validData[0], validData[2]], subjects, 10).valid, false);
  assert.equal(validateStudentReportMarks(validData.slice(0, 2), subjects, 10).valid, false);
  assert.equal(validateStudentReportMarks([validData[0], null, validData[2]], subjects, 10).valid, false);
});

test('rejects invalid dates and missing subject marks', () => {
  assert.equal(isValidDateOnly('2024-02-29'), true);
  assert.equal(isValidDateOnly('2025-02-29'), false);
  assert.equal(isValidDateOnly('11/21/2026'), false);
  assert.equal(validateStudentReportMarks(validData.map((item, i) => i === 0 ? { ...item, date: '2026-02-30' } : item), subjects, 10).valid, false);
  assert.equal(validateStudentReportMarks(validData.map((item, i) => i === 0 ? { ...item, mark: '' } : item), subjects, 10).valid, false);
});

test('calculates totals and grades from validated marks without floating-point drift', () => {
  assert.deepEqual(calculateStudentReportResult(validData, 10), { total: 27.5, percentage: 91.67, grade: 'A+' });
});
