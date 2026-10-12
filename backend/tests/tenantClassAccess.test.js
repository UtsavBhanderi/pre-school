'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getAssignedClasses, canAccessAssignedClass } = require('../utils/tenantClassAccess');

test('teacher class access is limited to explicit active assignments', () => {
  const teacher = { status: 'active', role: 'teacher', classNames: ['Play Group', 'Nursery'] };
  assert.equal(canAccessAssignedClass(teacher, 'Play Group'), true);
  assert.equal(canAccessAssignedClass(teacher, 'nursery'), false);
  assert.equal(canAccessAssignedClass(teacher, 'UKG'), false);
  assert.deepEqual(getAssignedClasses(teacher), ['Play Group', 'Nursery']);
});

test('missing, suspended and empty class assignments fail closed', () => {
  assert.deepEqual(getAssignedClasses({ status: 'active', role: 'teacher', classNames: [] }), []);
  assert.equal(canAccessAssignedClass({ status: 'suspended', role: 'teacher', classNames: ['Nursery'] }, 'Nursery'), false);
  assert.equal(canAccessAssignedClass({ status: 'active', role: 'teacher', classNames: ['Nursery'] }, ''), false);
  assert.equal(canAccessAssignedClass(null, 'Nursery'), false);
});

test('non-teacher tenant roles can use a branch class after role permissions are checked', () => {
  assert.equal(canAccessAssignedClass({ status: 'active', role: 'admissions' }, 'Nursery'), true);
  assert.equal(canAccessAssignedClass({ status: 'active', role: 'accountant' }, 'Nursery'), true);
});
