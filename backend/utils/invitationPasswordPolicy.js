'use strict';

const MIN_EXISTING_PASSWORD_LENGTH = 8;
const MIN_NEW_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function isValidExistingAccountPassword(value) {
  return typeof value === 'string' &&
    value.length >= MIN_EXISTING_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH &&
    value.trim().length > 0;
}

function isValidNewAccountPassword(value) {
  return typeof value === 'string' &&
    value.length >= MIN_NEW_PASSWORD_LENGTH &&
    value.length <= MAX_PASSWORD_LENGTH &&
    value.trim().length > 0;
}

module.exports = {
  MIN_EXISTING_PASSWORD_LENGTH,
  MIN_NEW_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  isValidExistingAccountPassword,
  isValidNewAccountPassword,
};
