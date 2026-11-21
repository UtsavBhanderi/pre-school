'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  STUDENT_PROFILE_FIELDS,
  TEACHER_PROFILE_FIELDS,
  pickProfileFields,
} = require('../utils/legacyProfileFields');

test('student profile writes include supported admission fields and exclude protected data', () => {
  const result = pickProfileFields({
    firstName: '  Aarav  ',
    FatherMobileNumber: '09876543210',
    standard: 'ENG JR.',
    stuNo: 'FORGED-GR',
    marks: [{ total: 999 }],
    organizationId: '507f1f77bcf86cd799439011',
    branchId: '507f1f77bcf86cd799439012',
    createdBy: '507f1f77bcf86cd799439013',
    password: 'should-not-be-here',
    studentPhoto: 'uploads/students/forged.jpg',
    unknownField: 'ignored',
  }, STUDENT_PROFILE_FIELDS);

  assert.deepEqual(result, {
    firstName: 'Aarav',
    FatherMobileNumber: '09876543210',
    standard: 'ENG JR.',
  });
});

test('teacher profile writes cannot mutate account or tenancy fields', () => {
  const result = pickProfileFields({
    Email: '  TEACHER@EXAMPLE.COM ',
    standard: 'ENG SR.',
    GR_No: 'T-100',
    role: 'admin',
    authVersion: 999,
    organizationId: '507f1f77bcf86cd799439011',
    selfPhoto: 'uploads/teachers/forged.jpg',
  }, TEACHER_PROFILE_FIELDS);

  assert.deepEqual(result, {
    Email: 'TEACHER@EXAMPLE.COM',
    standard: 'ENG SR.',
    GR_No: 'T-100',
  });
});

test('profile picker safely handles malformed bodies', () => {
  assert.deepEqual(pickProfileFields(null, STUDENT_PROFILE_FIELDS), {});
  assert.deepEqual(pickProfileFields([], TEACHER_PROFILE_FIELDS), {});
  assert.deepEqual(pickProfileFields({ firstName: 'A' }, []), {});
});
