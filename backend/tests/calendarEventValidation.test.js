'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_EVENT_COLOR, validateCalendarEvent } = require('../utils/calendarEventValidation');

test('normalizes a valid event and applies the default colour', () => {
  const result = validateCalendarEvent({ title: '  Parent meeting  ', start: '2026-11-24T09:00:00+05:30', end: '2026-11-24T10:00:00+05:30' });
  assert.equal(result.valid, true); assert.equal(result.value.title, 'Parent meeting'); assert.equal(result.value.color, DEFAULT_EVENT_COLOR);
  assert.ok(result.value.start instanceof Date); assert.ok(result.value.end > result.value.start);
});

test('rejects missing title, invalid dates and non-positive event duration', () => {
  assert.equal(validateCalendarEvent({ start: '2026-11-24', end: '2026-11-25' }).valid, false);
  assert.equal(validateCalendarEvent({ title: 'Meeting', start: 'not a date', end: '2026-11-25' }).valid, false);
  assert.equal(validateCalendarEvent({ title: 'Meeting', start: '2026-11-24T10:00', end: '2026-11-24T09:00' }).valid, false);
  assert.equal(validateCalendarEvent({ title: 'Meeting', start: '2026-11-24T09:00', end: '2026-11-24T09:00' }).valid, false);
});

test('rejects oversized titles and untrusted colours', () => {
  assert.equal(validateCalendarEvent({ title: 'x'.repeat(121), start: '2026-11-24T09:00', end: '2026-11-24T10:00' }).valid, false);
  assert.equal(validateCalendarEvent({ title: 'Meeting', start: '2026-11-24T09:00', end: '2026-11-24T10:00', color: 'url(javascript:alert(1))' }).valid, false);
});


test('normalizes selected standards and removes duplicates', () => {
  const result = validateCalendarEvent({
    title: 'Class event',
    start: '2026-11-24T09:00',
    end: '2026-11-24T10:00',
    standards: [' Nursery ', 'Nursery', 'ENG JR.'],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.standards, ['Nursery', 'ENG JR.']);
});

test('rejects invalid or excessive selected standards', () => {
  const base = { title: 'Class event', start: '2026-11-24T09:00', end: '2026-11-24T10:00' };
  assert.equal(validateCalendarEvent({ ...base, standards: 'Nursery' }).valid, false);
  assert.equal(validateCalendarEvent({ ...base, standards: [''] }).valid, false);
  assert.equal(validateCalendarEvent({ ...base, standards: ['x'.repeat(81)] }).valid, false);
  assert.equal(validateCalendarEvent({ ...base, standards: Array.from({ length: 31 }, (_, index) => 'Class ' + index) }).valid, false);
});
