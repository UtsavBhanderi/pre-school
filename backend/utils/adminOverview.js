'use strict';

const { parseDateOnly } = require('./dateOnly');

const MAX_OVERVIEW_RANGE_DAYS = 90;

function validateOverviewRange(startValue, endValue, maxDays = MAX_OVERVIEW_RANGE_DAYS) {
  if (!Number.isInteger(maxDays) || maxDays < 1) {
    throw new RangeError('The maximum overview range must be a positive whole number of days.');
  }

  const startDate = String(startValue || '').trim();
  const endDate = String(endValue || '').trim();
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return { valid: false, code: 'INVALID_DATE_RANGE', message: 'Choose valid start and end dates.' };
  }
  if (start.getTime() > end.getTime()) {
    return { valid: false, code: 'REVERSED_DATE_RANGE', message: 'Start date must be on or before the end date.' };
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (dayCount > maxDays) {
    return {
      valid: false,
      code: 'DATE_RANGE_TOO_LARGE',
      message: 'Choose a date range of ' + maxDays + ' days or fewer.',
      dayCount,
    };
  }

  const endExclusive = new Date(end);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { valid: true, startDate, endDate, start, endExclusive, dayCount };
}

function buildDailySeries(range, rows, keyName, amountField) {
  const totals = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = String(row?._id || row?.date || '');
    if (!date) continue;
    const value = Number(row?.[amountField] || 0);
    totals.set(date, (totals.get(date) || 0) + (Number.isFinite(value) ? value : 0));
  }

  const output = [];
  for (let offset = 0; offset < range.dayCount; offset += 1) {
    const date = new Date(range.start);
    date.setUTCDate(date.getUTCDate() + offset);
    const key = date.toISOString().slice(0, 10);
    output.push({ date: key, [keyName]: Number((totals.get(key) || 0).toFixed(2)) });
  }
  return output;
}

module.exports = { MAX_OVERVIEW_RANGE_DAYS, validateOverviewRange, buildDailySeries };
