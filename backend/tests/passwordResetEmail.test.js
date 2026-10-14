'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPasswordResetUrl } = require('../utils/passwordResetEmail');

test('password reset secrets are held in the URL fragment rather than query/path', () => {
  const previousUrl = process.env.FRONTEND_URL;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_URL = 'https://school.example.com';
  delete process.env.FRONTEND_ORIGIN;
  try {
    const token = 'x'.repeat(43);
    const url = new URL(createPasswordResetUrl(token));
    assert.equal(url.origin, 'https://school.example.com');
    assert.equal(url.pathname, '/reset-password');
    assert.equal(url.search, '');
    assert.equal(url.hash, '#token=' + token);
  } finally {
    if (previousUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});
