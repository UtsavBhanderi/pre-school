'use strict';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRANCH_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugifyOrganizationName(value) {
  const slug = cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    .replace(/-+$/g, '');
  return slug || 'preschool';
}

function validateOrganizationRegistration(input = {}) {
  const organizationName = cleanText(input.organizationName);
  const branchName = cleanText(input.branchName);
  const username = cleanText(input.username);
  const email = cleanText(input.email).toLowerCase();
  const password = typeof input.password === 'string' ? input.password : '';
  const timezone = cleanText(input.timezone) || 'Asia/Kolkata';
  const requestedCode = cleanText(input.branchCode || 'MAIN').toUpperCase();
  const errors = {};

  if (organizationName.length < 2 || organizationName.length > 120) {
    errors.organizationName = 'Organization name must contain 2 to 120 characters.';
  }
  if (branchName.length < 2 || branchName.length > 120) {
    errors.branchName = 'First branch name must contain 2 to 120 characters.';
  }
  if (username.length < 2 || username.length > 80) {
    errors.username = 'Owner name must contain 2 to 80 characters.';
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (password.length < 12 || password.length > 128 || !password.trim()) {
    errors.password = 'Password must contain 12 to 128 characters.';
  }
  if (requestedCode.length < 2 || requestedCode.length > 16 || !BRANCH_CODE_PATTERN.test(requestedCode)) {
    errors.branchCode = 'Branch code must use 2 to 16 letters, numbers or hyphens.';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    errors.timezone = 'Choose a valid time zone.';
  }

  if (Object.keys(errors).length) return { valid: false, errors };

  return {
    valid: true,
    value: {
      organizationName,
      organizationSlugBase: slugifyOrganizationName(organizationName),
      branchName,
      branchCode: requestedCode,
      username,
      email,
      password,
      timezone,
    },
  };
}

module.exports = { cleanText, slugifyOrganizationName, validateOrganizationRegistration };
