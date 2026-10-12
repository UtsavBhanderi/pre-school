'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ageInMonths } = require('../utils/ageInMonths');

test('age is calculated in whole months without timezone drift', () => {
  assert.equal(ageInMonths('2023-10-12', '2026-10-12'), 36);
  assert.equal(ageInMonths('2023-10-13', '2026-10-12'), 35);
  assert.equal(ageInMonths('2023-09-30', '2023-10-01'), 0);
});

test('invalid dates are rejected by the age calculator', () => {
  assert.equal(ageInMonths('2026-02-30', '2026-10-12'), null);
  assert.equal(ageInMonths('2026-10-12', 'not-a-date'), null);
});
