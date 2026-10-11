'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileAttendanceEntries } = require('../utils/attendanceReconciliation');

test('updates existing children and adds only children not previously recorded', () => {
  const record = {
    _id: 'attendance-1',
    studentDetails: [
      { studentId: 'student-1', status: 'absent', reason: 'sick' },
      { studentId: 'student-2', status: 'present', reason: '' },
    ],
  };

  const result = reconcileAttendanceEntries([
    { studentId: 'student-1', status: 'present', reason: '' },
    { studentId: 'student-2', status: 'absent', reason: '  family visit  ' },
    { studentId: 'student-3', status: 'present', reason: '' },
  ], [record]);

  assert.equal(result.recordsToSave.length, 1);
  assert.equal(result.updatedCount, 2);
  assert.equal(result.newEntries.length, 1);
  assert.equal(result.newEntries[0].studentId, 'student-3');
  assert.deepEqual(record.studentDetails, [
    { studentId: 'student-1', status: 'present', reason: '' },
    { studentId: 'student-2', status: 'absent', reason: 'family visit' },
  ]);
});

test('uses the newest matching record when older duplicate attendance exists', () => {
  const newest = {
    _id: 'newest',
    studentDetails: [{ studentId: 'student-1', status: 'absent', reason: 'ill' }],
  };
  const older = {
    _id: 'older',
    studentDetails: [{ studentId: 'student-1', status: 'present', reason: '' }],
  };

  const result = reconcileAttendanceEntries([
    { studentId: 'student-1', status: 'present', reason: '' },
  ], [newest, older]);

  assert.equal(result.recordsToSave.length, 1);
  assert.equal(String(result.recordsToSave[0]._id), 'newest');
  assert.equal(newest.studentDetails[0].status, 'present');
  assert.equal(older.studentDetails[0].status, 'present');
  assert.equal(result.newEntries.length, 0);
});

test('re-submitting a saved class does not plan duplicate entries', () => {
  const record = {
    _id: 'attendance-1',
    studentDetails: [
      { studentId: 'student-1', status: 'present', reason: '' },
      { studentId: 'student-2', status: 'absent', reason: 'sick' },
    ],
  };
  const submitted = [
    { studentId: 'student-1', status: 'present', reason: '' },
    { studentId: 'student-2', status: 'absent', reason: 'sick' },
  ];

  const result = reconcileAttendanceEntries(submitted, [record]);

  assert.equal(result.newEntries.length, 0);
  assert.equal(result.updatedCount, 2);
  assert.deepEqual(result.recordsToSave.map((item) => item._id), ['attendance-1']);
});
