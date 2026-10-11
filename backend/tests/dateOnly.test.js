'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDateOnly, parseDateInput, getUtcDayBounds } = require('../utils/dateOnly');

test('parseDateOnly accepts real YYYY-MM-DD dates', () => {
  assert.equal(parseDateOnly('2026-10-11').toISOString(), '2026-10-11T00:00:00.000Z');
});

test('parseDateOnly rejects impossible and incorrectly formatted dates', () => {
  assert.equal(parseDateOnly('2026-02-29'), null);
  assert.equal(parseDateOnly('2026-13-01'), null);
  assert.equal(parseDateOnly('11/10/2026'), null);
  assert.equal(parseDateOnly(''), null);
});

test('parseDateInput accepts date-only and valid ISO timestamp inputs', () => {
  assert.equal(parseDateInput('2026-10-11').toISOString(), '2026-10-11T00:00:00.000Z');
  assert.equal(parseDateInput('2026-10-11T08:15:00.000Z').toISOString(), '2026-10-11T08:15:00.000Z');
  assert.equal(parseDateInput('not-a-date'), null);
});

test('getUtcDayBounds returns a half-open UTC day for safe date filtering', () => {
  const bounds = getUtcDayBounds('2026-10-11');
  assert.equal(bounds.start.toISOString(), '2026-10-11T00:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-12T00:00:00.000Z');
  assert.equal(bounds.end - bounds.start, 24 * 60 * 60 * 1000);
  assert.equal(getUtcDayBounds('invalid'), null);
});
