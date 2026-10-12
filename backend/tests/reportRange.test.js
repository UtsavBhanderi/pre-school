'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReportRange } = require('../utils/reportRange');

test('report date range accepts valid single-day and inclusive annual ranges', () => {
  assert.equal(validateReportRange('2026-10-12', '2026-10-12').dayCount, 1);
  const year = validateReportRange('2025-01-01', '2026-01-01');
  assert.equal(year.valid, true);
  assert.equal(year.dayCount, 366);
});

test('report date range rejects invalid, reversed and excessive intervals', () => {
  assert.equal(validateReportRange('2026-02-30', '2026-03-01').valid, false);
  assert.equal(validateReportRange('2026-10-13', '2026-10-12').valid, false);
  assert.equal(validateReportRange('2025-01-01', '2026-01-02').valid, false);
  assert.throws(() => validateReportRange('2026-01-01', '2026-01-02', 0), /positive whole number/);
});
