'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeInstallments, allocatePaymentsToInstallments } = require('../utils/feeInstallments');
test('normalizes a complete schedule against the fee after discount', () => {
  const result = normalizeInstallments([{ label: 'First', dueDate: '2026-12-01', amount: 450 }, { label: 'Second', dueDate: '2027-01-01', amount: 450 }], 1000, 100);
  assert.equal(result.valid, true);
  assert.equal(result.value.length, 2);
});
test('rejects invalid dates, out-of-order dates and incomplete totals', () => {
  assert.equal(normalizeInstallments([{ dueDate: '2026-02-30', amount: 900 }], 900).valid, false);
  assert.equal(normalizeInstallments([{ dueDate: '2027-01-01', amount: 450 }, { dueDate: '2026-12-01', amount: 450 }], 900).valid, false);
  assert.equal(normalizeInstallments([{ dueDate: '2026-12-01', amount: 899 }], 900).valid, false);
});
test('allocates payments oldest-first and marks paid, partial and upcoming installments', () => {
  const rows = allocatePaymentsToInstallments([{ label: 'First', dueDate: '2026-10-01', amount: 300 }, { label: 'Second', dueDate: '2026-11-01', amount: 300 }, { label: 'Third', dueDate: '2026-12-01', amount: 300 }], 450, '2026-11-22');
  assert.deepEqual(rows.map((row) => [row.paidAmount, row.balance, row.status]), [[300, 0, 'paid'], [150, 150, 'partial'], [0, 300, 'upcoming']]);
});
