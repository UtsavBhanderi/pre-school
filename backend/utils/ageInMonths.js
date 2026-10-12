'use strict';

const { parseDateOnly } = require('./dateOnly');

function ageInMonths(dateOfBirth, asOfDate) {
  const birth = parseDateOnly(dateOfBirth);
  const asOf = parseDateOnly(asOfDate);
  if (!birth || !asOf) return null;
  let months = (asOf.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - birth.getUTCMonth());
  if (asOf.getUTCDate() < birth.getUTCDate()) months -= 1;
  return months;
}

module.exports = { ageInMonths };
