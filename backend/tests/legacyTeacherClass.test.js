'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeRegExp,
  buildTeacherProfileFilter,
  resolveTeacherClassAccess,
} = require('../utils/legacyTeacherClass');

test('teacher profile lookup uses a case-insensitive exact email match', () => {
  assert.deepEqual(buildTeacherProfileFilter(' Teacher+room.1@example.test '), {
    Email: { $regex: '^Teacher\\+room\\.1@example\\.test$', $options: 'i' },
  });
  assert.equal(buildTeacherProfileFilter(''), null);
  assert.equal(buildTeacherProfileFilter('x'.repeat(255)), null);
  assert.equal(escapeRegExp('a+b.c'), 'a\\+b\\.c');
});

test('administrators retain school-wide access without a teacher profile', () => {
  assert.deepEqual(resolveTeacherClassAccess('admin', '', 'ENG JR.'), {
    allowed: true, isTeacher: false, standard: 'ENG JR.',
  });
});

test('teachers are limited to their assigned class', () => {
  assert.deepEqual(resolveTeacherClassAccess('teacher', ' ENG JR. ', ''), {
    allowed: true, isTeacher: true, standard: 'ENG JR.',
  });
  assert.equal(resolveTeacherClassAccess('teacher', 'ENG JR.', 'ENG JR.').allowed, true);
  assert.equal(resolveTeacherClassAccess('teacher', 'ENG JR.', 'ENG SR.').code, 'TEACHER_CLASS_FORBIDDEN');
});

test('teachers without an assigned class are denied classroom access', () => {
  assert.equal(resolveTeacherClassAccess('teacher', '', '').code, 'TEACHER_CLASS_NOT_ASSIGNED');
  assert.equal(resolveTeacherClassAccess('teacher', null, 'ENG JR.').allowed, false);
});
