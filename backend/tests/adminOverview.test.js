'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOverviewRange, buildDailySeries, MAX_OVERVIEW_RANGE_DAYS } = require('../utils/adminOverview');

test('management overview validates inclusive date ranges and calculates the exclusive end boundary', () => {
  const singleDay = validateOverviewRange('2026-11-22', '2026-11-22');
  assert.equal(singleDay.valid, true);
  assert.equal(singleDay.dayCount, 1);
  assert.equal(singleDay.start.toISOString(), '2026-11-22T00:00:00.000Z');
  assert.equal(singleDay.endExclusive.toISOString(), '2026-11-23T00:00:00.000Z');

  const fullRange = validateOverviewRange('2026-09-01', '2026-11-29');
  assert.equal(fullRange.valid, true);
  assert.equal(fullRange.dayCount, MAX_OVERVIEW_RANGE_DAYS);
});

test('management overview rejects invalid, reversed and excessive ranges', () => {
  assert.equal(validateOverviewRange('2026-02-30', '2026-03-01').valid, false);
  assert.equal(validateOverviewRange('2026-11-23', '2026-11-22').code, 'REVERSED_DATE_RANGE');
  assert.equal(validateOverviewRange('2026-08-31', '2026-11-29').code, 'DATE_RANGE_TOO_LARGE');
  assert.throws(() => validateOverviewRange('2026-01-01', '2026-01-02', 0), /positive whole number/);
});

test('daily series fills missing dates with zero and preserves chronological order', () => {
  const range = validateOverviewRange('2026-11-20', '2026-11-22');
  const series = buildDailySeries(range, [
    { _id: '2026-11-22', total: 150 },
    { _id: '2026-11-20', total: 50 },
  ], 'collected', 'total');

  assert.deepEqual(series, [
    { date: '2026-11-20', collected: 50 },
    { date: '2026-11-21', collected: 0 },
    { date: '2026-11-22', collected: 150 },
  ]);
});
