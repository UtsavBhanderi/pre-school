'use strict';

const { ageInMonths } = require('./ageInMonths');

function evaluateClassEligibility({
  dateOfBirth,
  today,
  minAgeMonths = null,
  maxAgeMonths = null,
  capacity,
  enrolledCount = 0,
  enforceCapacity = false,
}) {
  let ageMonths = null;
  const hasMinimumAge = minAgeMonths !== null && minAgeMonths !== undefined;
  const hasMaximumAge = maxAgeMonths !== null && maxAgeMonths !== undefined;

  if ((hasMinimumAge || hasMaximumAge) && !dateOfBirth) {
    return {
      eligible: false,
      code: 'CLASS_DOB_REQUIRED',
      message: 'Enter the child’s date of birth because this class has an age requirement.',
    };
  }

  if (dateOfBirth) {
    ageMonths = ageInMonths(dateOfBirth, today);
    if (ageMonths === null || ageMonths < 0) {
      return { eligible: false, code: 'CLASS_AGE_LIMIT', message: 'Enter a valid date of birth that is not in the future.' };
    }
    if (hasMinimumAge && ageMonths < minAgeMonths) {
      return {
        eligible: false,
        code: 'CLASS_AGE_LIMIT',
        message: 'This class requires a minimum age of ' + minAgeMonths + ' months.',
      };
    }
    if (hasMaximumAge && ageMonths > maxAgeMonths) {
      return {
        eligible: false,
        code: 'CLASS_AGE_LIMIT',
        message: 'This class has a maximum admission age of ' + maxAgeMonths + ' months.',
      };
    }
  }

  if (enforceCapacity && Number.isInteger(capacity) && capacity > 0 && enrolledCount >= capacity) {
    return {
      eligible: false,
      code: 'CLASS_CAPACITY',
      message: 'This class has reached its configured capacity of ' + capacity + ' children.',
    };
  }

  return { eligible: true, ageMonths };
}

module.exports = { evaluateClassEligibility };
