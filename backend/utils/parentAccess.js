'use strict';

function cleanText(value, maxLength = 254) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function isValidParentPhone(value) {
  const normalized = normalizePhone(value);
  return normalized.length === 10;
}

function normalizeParentIdentifier(value) {
  return cleanText(value, 254).toLowerCase();
}

function isEmail(value) {
  return typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidParentPassword(value) {
  return typeof value === 'string' &&
    value.length >= 12 &&
    value.length <= 128 &&
    value.trim().length > 0;
}

function phoneMatches(recordValues, submittedPhone) {
  const expected = normalizePhone(submittedPhone);
  if (!expected || expected.length !== 10) return false;
  return (Array.isArray(recordValues) ? recordValues : [recordValues])
    .some((value) => normalizePhone(value) === expected);
}

function safeSchoolSlug(value) {
  return typeof value === 'string' &&
    value.length <= 140 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

module.exports = {
  cleanText,
  normalizePhone,
  isValidParentPhone,
  normalizeParentIdentifier,
  isEmail,
  isValidParentPassword,
  phoneMatches,
  safeSchoolSlug,
};
