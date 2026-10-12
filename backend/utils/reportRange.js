'use strict';

const { parseDateOnly } = require('./dateOnly');

function validateReportRange(fromText, toText, maximumDays = 366) {
  const fromDate = parseDateOnly(fromText);
  const toDate = parseDateOnly(toText);
  if (!fromDate || !toDate || fromDate > toDate) {
    return { valid: false, message: 'Choose a valid start and end date.' };
  }
  if (!Number.isInteger(maximumDays) || maximumDays < 1 || maximumDays > 3660) {
    throw new TypeError('The maximum report range must be a positive whole number of days.');
  }
  const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (dayCount > maximumDays) {
    return { valid: false, message: 'Choose a date range of ' + maximumDays + ' days or fewer.' };
  }
  return { valid: true, fromDate, toDate, dayCount };
}

module.exports = { validateReportRange };
