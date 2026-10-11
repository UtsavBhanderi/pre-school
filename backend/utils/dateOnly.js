'use strict';

const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) return null;

  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
    ? date
    : null;
};

const parseDateInput = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(text)) return parseDateOnly(text);

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getUtcDayBounds = (value) => {
  const parsedDate = value instanceof Date ? value : parseDateInput(value);
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null;

  const start = new Date(Date.UTC(
    parsedDate.getUTCFullYear(),
    parsedDate.getUTCMonth(),
    parsedDate.getUTCDate()
  ));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

module.exports = { parseDateOnly, parseDateInput, getUtcDayBounds };
