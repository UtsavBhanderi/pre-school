'use strict';

const DEFAULT_EVENT_COLOR = '#3788d8';
const EVENT_AUDIENCES = ['all', 'parents', 'teachers'];

function validateCalendarEvent(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const start = input.start instanceof Date ? new Date(input.start) : new Date(input.start);
  const end = input.end instanceof Date ? new Date(input.end) : new Date(input.end);
  const color = typeof input.color === 'string' && input.color.trim() ? input.color.trim() : DEFAULT_EVENT_COLOR;
  const audience = typeof input.audience === 'string' && input.audience.trim()
    ? input.audience.trim()
    : 'all';
  const rawStandards = input.standards === undefined ? [] : input.standards;
  if (!Array.isArray(rawStandards)) return { valid: false, message: 'Choose one or more valid school standards.' };
  const standards = [...new Set(rawStandards.map((value) => typeof value === 'string' ? value.trim() : ''))];
  if (standards.some((value) => !value || value.length > 80) || standards.length > 30) {
    return { valid: false, message: 'Choose up to 30 valid school standards.' };
  }
  if (!title) return { valid: false, message: 'Enter an event title before saving.' };
  if (title.length > 120) return { valid: false, message: 'The event title must be 120 characters or fewer.' };
  if (!input.start || Number.isNaN(start.getTime())) return { valid: false, message: 'Choose a valid event start date and time.' };
  if (!input.end || Number.isNaN(end.getTime())) return { valid: false, message: 'Choose a valid event end date and time.' };
  if (end <= start) return { valid: false, message: 'The event end time must be after its start time.' };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { valid: false, message: 'Choose a valid event colour.' };
  if (!EVENT_AUDIENCES.includes(audience)) return { valid: false, message: 'Choose Everyone, Parents only or Teachers only for event visibility.' };
  return { valid: true, value: { title, start, end, color, audience, standards } };
}

module.exports = { DEFAULT_EVENT_COLOR, EVENT_AUDIENCES, validateCalendarEvent };
