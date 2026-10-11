'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { asAmount, calculateRemaining } = require('../utils/feeMath');

test('asAmount converts numeric strings', () => {
  assert.equal(asAmount('1250'), 1250);
});

test('asAmount rejects invalid or negative values', () => {
  assert.equal(asAmount('not-a-number'), 0);
  assert.equal(asAmount(-20), 0);
  assert.equal(asAmount(undefined, 12), 12);
});

test('calculateRemaining deducts paid fees and discount', () => {
  assert.equal(calculateRemaining(25000, 10000, 2000), 13000);
});

test('calculateRemaining never returns a negative balance', () => {
  assert.equal(calculateRemaining(20000, 22000, 0), 0);
  assert.equal(calculateRemaining(20000, 10000, 15000), 0);
});

test('calculateRemaining treats invalid inputs as zero', () => {
  assert.equal(calculateRemaining('invalid', null, -1), 0);
});

const { STANDARD_FEES } = require('../config/standardFees');

test('standard fee schedule covers each preschool class', () => {
  assert.deepEqual(Object.keys(STANDARD_FEES), [
    'ENG Play Group',
    'ENG NR.',
    'ENG JR.',
    'ENG SR.',
    'GUJ Play Group',
    'GUJ NR.',
    'GUJ JR.',
    'GUJ SR.',
  ]);
  assert.equal(STANDARD_FEES['ENG Play Group'], 19900);
  assert.equal(STANDARD_FEES['ENG JR.'], 20900);
  assert.equal(STANDARD_FEES['GUJ Play Group'], 14500);
  assert.equal(STANDARD_FEES['GUJ JR.'], 15000);
});
