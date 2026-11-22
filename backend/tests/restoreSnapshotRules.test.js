'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSingleSchoolSnapshot } = require('../ops/restoreSnapshotRules');

const validIndexes = {
  userIndexes: [{ unique: true, key: { email: 1 } }],
  studentIndexes: [{ unique: true, key: { stuNo: 1 } }],
  teacherIndexes: [{ unique: true, key: { GR_No: 1 } }],
};

function validSnapshot(overrides = {}) {
  return {
    collectionNames: ['users', 'students', 'teachers'],
    activeAdministratorCount: 1,
    organizationCount: 0,
    membershipCount: 0,
    ...validIndexes,
    ...overrides,
  };
}

test('single-school restore verification accepts the legacy school collections and identity indexes', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot());
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('single-school restore verification accepts older administrator records without a status field', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot({ activeAdministratorCount: 2 }));
  assert.equal(result.valid, true);
});

test('single-school restore verification rejects missing school collections', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot({
    collectionNames: ['users', 'students'],
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /teachers/);
});

test('single-school restore verification rejects a backup without an active administrator', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot({ activeAdministratorCount: 0 }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /active administrator/);
});

test('single-school restore verification rejects SaaS organization or membership data', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot({
    organizationCount: 1,
    membershipCount: 1,
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /single-school database/);
});

test('single-school restore verification rejects missing unique login and student identity indexes', () => {
  const result = validateSingleSchoolSnapshot(validSnapshot({
    studentIndexes: [{ unique: false, key: { stuNo: 1 } }],
  }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /students\.stuNo/);
});
