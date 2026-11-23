'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCalendarStandards,
  buildCalendarStandardVisibilityFilter,
} = require('../utils/calendarStandardVisibility');

test('normalizes standard names without blanks or duplicates', () => {
  assert.deepEqual(normalizeCalendarStandards([' Nursery ', 'Nursery', '', null, 'ENG JR.']), ['Nursery', 'ENG JR.']);
});

test('standard visibility includes all-school events and matching classes only', () => {
  assert.deepEqual(buildCalendarStandardVisibilityFilter(['Nursery']), {
    $or: [
      { standards: { $exists: false } },
      { standards: { $size: 0 } },
      { standards: { $in: ['Nursery'] } },
    ],
  });
});

test('teachers without a class assignment only receive all-school events', () => {
  assert.deepEqual(buildCalendarStandardVisibilityFilter([]), {
    $or: [
      { standards: { $exists: false } },
      { standards: { $size: 0 } },
    ],
  });
});
