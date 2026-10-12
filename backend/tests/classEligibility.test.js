'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateClassEligibility } = require('../utils/classEligibility');

test('class age limits accept children inside the configured age range', () => {
  assert.deepEqual(evaluateClassEligibility({
    dateOfBirth: '2023-10-12',
    today: '2026-10-12',
    minAgeMonths: 24,
    maxAgeMonths: 48,
  }), { eligible: true, ageMonths: 36 });
});

test('class age limits require a birth date when age requirements are configured', () => {
  const result = evaluateClassEligibility({
    dateOfBirth: '',
    today: '2026-10-12',
    minAgeMonths: 24,
    maxAgeMonths: 48,
  });
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'CLASS_DOB_REQUIRED');
});

test('class age limits reject a child who is too young or too old', () => {
  assert.equal(evaluateClassEligibility({
    dateOfBirth: '2025-10-12',
    today: '2026-10-12',
    minAgeMonths: 24,
  }).code, 'CLASS_AGE_LIMIT');
  assert.equal(evaluateClassEligibility({
    dateOfBirth: '2020-10-12',
    today: '2026-10-12',
    maxAgeMonths: 48,
  }).code, 'CLASS_AGE_LIMIT');
});

test('class eligibility rejects future and malformed birth dates', () => {
  assert.equal(evaluateClassEligibility({
    dateOfBirth: '2026-10-13',
    today: '2026-10-12',
  }).code, 'CLASS_AGE_LIMIT');
  assert.equal(evaluateClassEligibility({
    dateOfBirth: '2026-02-30',
    today: '2026-10-12',
  }).code, 'CLASS_AGE_LIMIT');
});

test('capacity checks reject the next child at the configured limit', () => {
  assert.equal(evaluateClassEligibility({ capacity: 30, enrolledCount: 29, enforceCapacity: true }).eligible, true);
  const result = evaluateClassEligibility({ capacity: 30, enrolledCount: 30, enforceCapacity: true });
  assert.equal(result.eligible, false);
  assert.equal(result.code, 'CLASS_CAPACITY');
});
