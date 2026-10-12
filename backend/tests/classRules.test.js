'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ageInCompletedMonths, validateClassAge, validateClassCapacity } = require('../utils/classRules');

test('completed months use the day within the month, not only the month difference', () => {
  assert.equal(ageInCompletedMonths('2024-01-15', '2024-02-14'), 0);
  assert.equal(ageInCompletedMonths('2024-01-15', '2024-02-15'), 1);
  assert.equal(ageInCompletedMonths('2023-01-31', '2023-02-28'), 0);
  assert.equal(ageInCompletedMonths('2023-01-30', '2023-03-01'), 1);
});

test('age rules enforce minimum and maximum boundaries inclusively', () => {
  const classConfig = { minAgeMonths: 24, maxAgeMonths: 47 };
  assert.equal(validateClassAge('2024-10-12', '2026-10-12', classConfig).valid, true);
  assert.equal(validateClassAge('2024-10-13', '2026-10-12', classConfig).code, 'BELOW_MINIMUM_AGE');
  assert.equal(validateClassAge('2022-11-12', '2026-10-12', classConfig).code, 'ABOVE_MAXIMUM_AGE');
});

test('missing and future dates are rejected when appropriate', () => {
  assert.equal(validateClassAge('', '2026-10-12', { minAgeMonths: 24 }).code, 'DATE_OF_BIRTH_REQUIRED');
  assert.equal(validateClassAge('', '2026-10-12', {}).valid, true);
  assert.equal(validateClassAge('2026-10-13', '2026-10-12', {}).code, 'FUTURE_DATE_OF_BIRTH');
  assert.equal(ageInCompletedMonths('not-a-date', '2026-10-12'), null);
});

test('capacity allows enrollment below the limit and refuses the final over-capacity child', () => {
  assert.equal(validateClassCapacity(9, 10).valid, true);
  assert.equal(validateClassCapacity(10, 10).code, 'CLASS_CAPACITY_REACHED');
  assert.equal(validateClassCapacity(0, 10).valid, true);
  assert.equal(validateClassCapacity(-1, 10).code, 'INVALID_ENROLLMENT_COUNT');
  assert.equal(validateClassCapacity(0, 0).code, 'INVALID_CLASS_CAPACITY');
});
