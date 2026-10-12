'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMoneyToPaise,
  formatPaise,
  normalizeInvoiceLines,
  calculateInvoiceBalance,
} = require('../utils/tenantMoney');

test('currency input converts to integer paise without floating-point sums', () => {
  assert.equal(parseMoneyToPaise('123.45'), 12345);
  assert.equal(parseMoneyToPaise('0'), 0);
  assert.equal(parseMoneyToPaise(0.1), 10);
  assert.equal(formatPaise(12345), '123.45');
});

test('currency parsing rejects negatives, excess precision and exponent notation', () => {
  for (const value of ['-1', '1.001', '1e5', '1,000', '', '  ', 'Infinity', NaN]) {
    assert.equal(parseMoneyToPaise(value), null, 'must reject ' + String(value));
  }
});

test('invoice line totals and subtotal are calculated in integer paise', () => {
  const result = normalizeInvoiceLines([
    { description: 'Tuition fee', quantity: 1, unitAmount: '1250.50' },
    { description: 'Activity fee', quantity: 2, unitAmount: '25.25' },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.lineItems[1].lineTotalPaise, 5050);
  assert.equal(result.subtotalPaise, 130550);
});

test('invoice line validation rejects empty, invalid and excessive entries', () => {
  assert.equal(normalizeInvoiceLines([]).valid, false);
  assert.equal(normalizeInvoiceLines([{ description: 'x', quantity: 1, unitAmount: '1' }]).valid, false);
  assert.equal(normalizeInvoiceLines([{ description: 'Book', quantity: 0, unitAmount: '1' }]).valid, false);
});

test('invoice balances include refunds as negative ledger entries', () => {
  const balance = calculateInvoiceBalance(10000, [
    { type: 'payment', amountPaise: 5000 },
    { type: 'payment', amountPaise: 3000 },
    { type: 'refund', amountPaise: 1000 },
  ]);
  assert.deepEqual(balance, { netPaidPaise: 7000, outstandingPaise: 3000, overpaidPaise: 0 });
});
