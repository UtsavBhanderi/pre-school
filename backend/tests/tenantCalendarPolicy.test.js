'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canReadCalendar,
  canManageCalendar,
  audienceForRole,
  validateCalendarEvent,
  validateCalendarRange,
} = require('../utils/tenantCalendarPolicy');

const now = new Date('2026-10-12T10:00:00.000Z');

test('calendar read and manage permissions fail closed for inactive memberships', () => {
  assert.equal(canReadCalendar({ status: 'active', role: 'teacher' }), true);
  assert.equal(canReadCalendar({ status: 'active', role: 'parent' }), true);
  assert.equal(canReadCalendar({ status: 'invited', role: 'teacher' }), false);
  assert.equal(canManageCalendar({ status: 'active', role: 'organization_owner' }), true);
  assert.equal(canManageCalendar({ status: 'active', role: 'teacher' }), false);
  assert.deepEqual(audienceForRole('parent'), ['all', 'parents']);
  assert.deepEqual(audienceForRole('teacher'), ['all', 'staff']);
});

test('event validation trims content and accepts valid scheduled events', () => {
  const result = validateCalendarEvent({
    title: '  Diwali Holiday  ',
    description: 'School remains closed.',
    type: 'holiday',
    audience: 'all',
    startsAt: '2026-10-20T00:00:00.000Z',
    endsAt: '2026-10-21T00:00:00.000Z',
    allDay: true,
    location: '',
  }, {}, now);
  assert.equal(result.valid, true);
  assert.equal(result.value.title, 'Diwali Holiday');
  assert.equal(result.value.type, 'holiday');
  assert.equal(result.value.allDay, true);
});

test('event validation rejects invalid audiences, types and date order', () => {
  const base = {
    title: 'Annual Day',
    description: 'Annual celebration',
    type: 'school_event',
    audience: 'unknown',
    startsAt: '2026-10-22T10:00:00.000Z',
    endsAt: '2026-10-22T09:00:00.000Z',
    allDay: false,
  };
  const result = validateCalendarEvent(base, {}, now);
  assert.equal(result.valid, false);
  assert.ok(result.errors.audience);
  assert.ok(result.errors.endsAt);
});

test('calendar date range validation requires real dates and caps range length', () => {
  assert.equal(validateCalendarRange('2026-10-01', '2026-10-31').valid, true);
  assert.equal(validateCalendarRange('2026-02-30', '2026-03-01').valid, false);
  assert.equal(validateCalendarRange('2026-11-01', '2026-10-01').valid, false);
  assert.equal(validateCalendarRange('2025-10-01', '2026-10-03').valid, false);
});
