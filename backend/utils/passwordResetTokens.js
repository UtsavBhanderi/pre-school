'use strict';

const crypto = require('crypto');

const PASSWORD_RESET_TTL_MINUTES = 30;

function createPasswordResetToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPasswordResetToken(token) };
}

function hashPasswordResetToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function passwordResetExpiry(from = new Date()) {
  return new Date(from.getTime() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}

function isPasswordResetLive(record, now = new Date()) {
  return Boolean(
    record &&
    typeof record.passwordResetTokenHash === 'string' &&
    record.passwordResetTokenHash.length === 64 &&
    record.passwordResetExpiresAt instanceof Date &&
    record.passwordResetExpiresAt.getTime() > now.getTime()
  );
}

function isValidNewPassword(value) {
  return typeof value === 'string' &&
    value.length >= 12 &&
    value.length <= 128 &&
    value.trim().length > 0;
}

module.exports = {
  PASSWORD_RESET_TTL_MINUTES,
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
  isPasswordResetLive,
  isValidNewPassword,
};
