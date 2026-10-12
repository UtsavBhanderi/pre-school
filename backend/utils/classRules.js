'use strict';

const { parseDateOnly } = require('./dateOnly');

function ageInCompletedMonths(dateOfBirth, asOfDate) {
  const birth = parseDateOnly(dateOfBirth);
  const asOf = parseDateOnly(asOfDate);
  if (!birth || !asOf) return null;
  if (birth.getTime() > asOf.getTime()) return -1;

  let months = (asOf.getUTCFullYear() - birth.getUTCFullYear()) * 12;
  months += asOf.getUTCMonth() - birth.getUTCMonth();
  if (asOf.getUTCDate() < birth.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

function validateClassAge(dateOfBirth, asOfDate, classConfig) {
  const minimum = classConfig?.minAgeMonths;
  const maximum = classConfig?.maxAgeMonths;
  const hasMinimum = Number.isInteger(minimum);
  const hasMaximum = Number.isInteger(maximum);
  const ageMonths = ageInCompletedMonths(dateOfBirth, asOfDate);

  if (ageMonths === null) {
    if (hasMinimum || hasMaximum) {
      return { valid: false, code: 'DATE_OF_BIRTH_REQUIRED', ageMonths: null, message: 'Enter a valid date of birth because this class has an age requirement.' };
    }
    return { valid: true, code: null, ageMonths: null, message: '' };
  }
  if (ageMonths < 0) {
    return { valid: false, code: 'FUTURE_DATE_OF_BIRTH', ageMonths, message: 'Date of birth cannot be in the future.' };
  }
  if (hasMinimum && ageMonths < minimum) {
    return {
      valid: false,
      code: 'BELOW_MINIMUM_AGE',
      ageMonths,
      message: 'The child is ' + ageMonths + ' months old. This class requires at least ' + minimum + ' months.',
    };
  }
  if (hasMaximum && ageMonths > maximum) {
    return {
      valid: false,
      code: 'ABOVE_MAXIMUM_AGE',
      ageMonths,
      message: 'The child is ' + ageMonths + ' months old. This class accepts children up to ' + maximum + ' months.',
    };
  }
  return { valid: true, code: null, ageMonths, message: '' };
}

function validateClassCapacity(currentEnrollment, capacity) {
  if (!Number.isInteger(currentEnrollment) || currentEnrollment < 0) {
    return { valid: false, code: 'INVALID_ENROLLMENT_COUNT', message: 'The current class enrollment count could not be verified.' };
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    return { valid: false, code: 'INVALID_CLASS_CAPACITY', message: 'This class does not have a valid capacity setting.' };
  }
  if (currentEnrollment >= capacity) {
    return {
      valid: false,
      code: 'CLASS_CAPACITY_REACHED',
      message: 'This class is at capacity (' + currentEnrollment + ' of ' + capacity + ' children). Increase its capacity or select another class.',
    };
  }
  return { valid: true, code: null, message: '' };
}

module.exports = { ageInCompletedMonths, validateClassAge, validateClassCapacity };
