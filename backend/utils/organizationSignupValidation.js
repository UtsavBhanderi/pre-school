'use strict';

const { slugifyOrganizationName, cleanText } = require('./tenantRegistration');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BRANCH_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function validateOrganizationSignupRequest(input = {}) {
  const organizationName = cleanText(input.organizationName);
  const branchName = cleanText(input.branchName);
  const username = cleanText(input.username);
  const email = cleanText(input.email).toLowerCase();
  const branchCode = cleanText(input.branchCode || 'MAIN').toUpperCase();
  const timezone = cleanText(input.timezone) || 'Asia/Kolkata';
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
  if (branchCode.length < 2 || branchCode.length > 16 || !BRANCH_CODE_PATTERN.test(branchCode)) {
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
      branchCode,
      username,
      email,
      timezone,
    },
  };
}

module.exports = { validateOrganizationSignupRequest };
