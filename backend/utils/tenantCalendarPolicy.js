'use strict';

const EVENT_TYPES = ['holiday', 'school_event', 'meeting', 'trip', 'birthday', 'deadline', 'other'];
const EVENT_AUDIENCES = ['all', 'staff', 'parents'];
const CALENDAR_READ_ROLES = [
  'organization_owner', 'head_office_admin', 'branch_admin',
  'admissions', 'teacher', 'accountant', 'hr_manager', 'transport_staff', 'parent',
];
const CALENDAR_MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin'];
const MAX_EVENT_DURATION_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_QUERY_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function canReadCalendar(membership) {
  return Boolean(membership && membership.status === 'active' && CALENDAR_READ_ROLES.includes(membership.role));
}

function canManageCalendar(membership) {
  return Boolean(membership && membership.status === 'active' && CALENDAR_MANAGER_ROLES.includes(membership.role));
}

function audienceForRole(role) {
  if (CALENDAR_MANAGER_ROLES.includes(role)) return ['all', 'staff', 'parents'];
  if (role === 'parent') return ['all', 'parents'];
  if (CALENDAR_READ_ROLES.includes(role)) return ['all', 'staff'];
  return [];
}

function validateCalendarEvent(input = {}, existing = {}, now = new Date()) {
  const title = cleanText(input.title === undefined ? existing.title : input.title, 140);
  const description = cleanText(input.description === undefined ? existing.description : input.description, 3000);
  const type = cleanText(input.type === undefined ? (existing.type || 'school_event') : input.type, 40);
  const audience = cleanText(input.audience === undefined ? (existing.audience || 'all') : input.audience, 20);
  const location = cleanText(input.location === undefined ? existing.location : input.location, 180);
  const allDay = input.allDay === undefined ? Boolean(existing.allDay) : input.allDay === true;
  const rawStart = input.startsAt === undefined ? existing.startsAt : input.startsAt;
  const rawEnd = input.endsAt === undefined ? existing.endsAt : input.endsAt;
  const startsAt = rawStart instanceof Date ? new Date(rawStart) : new Date(rawStart);
  const endsAt = rawEnd instanceof Date ? new Date(rawEnd) : new Date(rawEnd);
  const errors = {};

  if (title.length < 3) errors.title = 'Event title must contain 3 to 140 characters.';
  if (typeof description !== 'string') errors.description = 'Enter a valid event description.';
  if (!EVENT_TYPES.includes(type)) errors.type = 'Choose a valid event type.';
  if (!EVENT_AUDIENCES.includes(audience)) errors.audience = 'Choose Everyone, Staff, or Parents as the audience.';
  if (typeof (input.allDay === undefined ? (existing.allDay ?? false) : input.allDay) !== 'boolean') {
    errors.allDay = 'Choose whether this is an all-day event.';
  }
  if (!rawStart || Number.isNaN(startsAt.getTime())) errors.startsAt = 'Choose a valid event start date and time.';
  if (!rawEnd || Number.isNaN(endsAt.getTime())) errors.endsAt = 'Choose a valid event end date and time.';
  if (!errors.startsAt && !errors.endsAt) {
    if (endsAt <= startsAt) errors.endsAt = 'The event end must be later than the start.';
    else if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_DURATION_MS) errors.endsAt = 'An event cannot last longer than 366 days.';
    if (startsAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) {
      errors.startsAt = 'An event cannot start more than 366 days in the future.';
    }
  }

  if (Object.keys(errors).length) return { valid: false, errors, message: Object.values(errors)[0] };
  return {
    valid: true,
    value: { title, description, type, audience, location, allDay, startsAt, endsAt },
  };
}

function validateCalendarRange(fromValue, toValue) {
  const from = typeof fromValue === 'string' ? fromValue.trim() : '';
  const to = typeof toValue === 'string' ? toValue.trim() : '';
  if (!from || !to) return { valid: false, message: 'Choose both a start and end date.' };

  const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateOnlyPattern.test(from) || !dateOnlyPattern.test(to)) {
    return { valid: false, message: 'Use a valid start and end date.' };
  }
  const start = new Date(from + 'T00:00:00.000Z');
  const end = new Date(to + 'T00:00:00.000Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ||
      start.toISOString().slice(0, 10) !== from || end.toISOString().slice(0, 10) !== to) {
    return { valid: false, message: 'Use real calendar dates.' };
  }
  if (end < start) return { valid: false, message: 'The end date must be on or after the start date.' };
  if (end.getTime() - start.getTime() > MAX_QUERY_RANGE_MS) {
    return { valid: false, message: 'Choose a date range of 366 days or fewer.' };
  }
  return { valid: true, from, to };
}

module.exports = {
  EVENT_TYPES,
  EVENT_AUDIENCES,
  CALENDAR_READ_ROLES,
  CALENDAR_MANAGER_ROLES,
  MAX_EVENT_DURATION_MS,
  canReadCalendar,
  canManageCalendar,
  audienceForRole,
  validateCalendarEvent,
  validateCalendarRange,
};
