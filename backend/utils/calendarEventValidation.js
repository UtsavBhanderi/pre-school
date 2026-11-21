'use strict';

const DEFAULT_EVENT_COLOR = '#3788d8';

function validateCalendarEvent(input = {}) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const start = input.start instanceof Date ? new Date(input.start) : new Date(input.start);
  const end = input.end instanceof Date ? new Date(input.end) : new Date(input.end);
  const color = typeof input.color === 'string' && input.color.trim() ? input.color.trim() : DEFAULT_EVENT_COLOR;
  if (!title) return { valid: false, message: 'Enter an event title before saving.' };
  if (title.length > 120) return { valid: false, message: 'The event title must be 120 characters or fewer.' };
  if (!input.start || Number.isNaN(start.getTime())) return { valid: false, message: 'Choose a valid event start date and time.' };
  if (!input.end || Number.isNaN(end.getTime())) return { valid: false, message: 'Choose a valid event end date and time.' };
  if (end <= start) return { valid: false, message: 'The event end time must be after its start time.' };
  if (!/^#[0-9a-f]{6}$/i.test(color)) return { valid: false, message: 'Choose a valid event colour.' };
  return { valid: true, value: { title, start, end, color } };
}

module.exports = { DEFAULT_EVENT_COLOR, validateCalendarEvent };
