'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeeAmount, validPaymentDate, normalizePaymentDetails, validateFeeAmounts, hasFeePaymentHistory } = require('../utils/feeValidation');

test('fee amounts accept non-negative values with up to two decimal places', () => {
  assert.deepEqual(parseFeeAmount('1250.50', 'Payment'), { valid: true, value: 1250.5 });
  assert.equal(parseFeeAmount(0, 'Discount').valid, true);
  assert.equal(parseFeeAmount('-1', 'Payment').valid, false);
  assert.equal(parseFeeAmount('1.001', 'Payment').valid, false);
  assert.equal(parseFeeAmount('Infinity', 'Payment').valid, false);
  assert.equal(parseFeeAmount('', 'Payment').valid, false);
});

test('payment dates must be real MM/DD/YYYY calendar dates', () => {
  assert.equal(validPaymentDate('11/21/2026'), true);
  assert.equal(validPaymentDate('02/29/2024'), true);
  assert.equal(validPaymentDate('02/29/2025'), false);
  assert.equal(validPaymentDate('13/01/2026'), false);
  assert.equal(validPaymentDate('2026-11-21'), false);
});

test('payment entries require positive amounts and reject excessive entries', () => {
  assert.equal(normalizePaymentDetails([{ date: '11/21/2026', time: '9:30 AM', amount: '100.50' }]).valid, true);
  assert.equal(normalizePaymentDetails([{ amount: '0' }]).valid, false);
  assert.equal(normalizePaymentDetails([{ amount: '-10' }]).valid, false);
  assert.equal(normalizePaymentDetails([{ date: '02/31/2026', amount: '10' }]).valid, false);
  assert.equal(normalizePaymentDetails(Array.from({ length: 101 }, () => ({ amount: 1 }))).valid, false);
});

test('discount cannot exceed class fees and payment entries determine total paid', () => {
  const result = validateFeeAmounts({ totalStandardFees: '20000', discount: '1500', paymentDetails: [{ amount: '1000' }, { amount: '500.50' }], paymentDetailsProvided: true });
  assert.equal(result.valid, true);
  assert.equal(result.value.totalFeesPaid, 1500.5);
  assert.equal(validateFeeAmounts({ totalStandardFees: 100, discount: 101 }).valid, false);
});

test('fee records with payment history must be retained for financial audit', () => {
  assert.equal(hasFeePaymentHistory({ totalFeesPaid: 0, paymentDetails: [] }), false);
  assert.equal(hasFeePaymentHistory({ totalFeesPaid: 100, paymentDetails: [] }), true);
  assert.equal(hasFeePaymentHistory({ totalFeesPaid: 0, paymentDetails: [{ amount: 1 }] }), true);
  assert.equal(hasFeePaymentHistory({}), false);
});
