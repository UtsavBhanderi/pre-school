'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getZonedDayBounds, getTodayInTimeZone } = require('../utils/zonedDate');

test('Indian school day uses local midnight instead of UTC midnight', () => {
  const bounds = getZonedDayBounds('2026-10-12', 'Asia/Kolkata');
  assert.equal(bounds.start.toISOString(), '2026-10-11T18:30:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-12T18:30:00.000Z');
  assert.equal(bounds.end - bounds.start, 24 * 60 * 60 * 1000);
});

test('school day boundaries account for daylight-saving transitions', () => {
  const spring = getZonedDayBounds('2026-03-08', 'America/New_York');
  const autumn = getZonedDayBounds('2026-11-01', 'America/New_York');
  assert.equal(spring.end - spring.start, 23 * 60 * 60 * 1000);
  assert.equal(autumn.end - autumn.start, 25 * 60 * 60 * 1000);
});

test('invalid dates and time zones are rejected', () => {
  assert.equal(getZonedDayBounds('2026-02-30', 'Asia/Kolkata'), null);
  assert.equal(getZonedDayBounds('2026-10-12', 'Moon/Base'), null);
  assert.equal(getTodayInTimeZone('Moon/Base'), null);
  assert.equal(typeof getTodayInTimeZone('Asia/Kolkata'), 'string');
});
