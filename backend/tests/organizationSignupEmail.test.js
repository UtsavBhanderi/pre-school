'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrganizationVerificationUrl, isVerificationEmailConfigured } = require('../utils/organizationSignupEmail');

test('verification secret is in the URL fragment, not query string', () => {
  const previousUrl = process.env.FRONTEND_URL;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_URL = 'https://school.example.com';
  delete process.env.FRONTEND_ORIGIN;
  try {
    const url = new URL(createOrganizationVerificationUrl('x'.repeat(43)));
    assert.equal(url.origin, 'https://school.example.com');
    assert.equal(url.pathname, '/verify-organization');
    assert.equal(url.search, '');
    assert.ok(url.hash.includes('token='));
  } finally {
    if (previousUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test('verification email is not marked ready without SMTP credentials', () => {
  const keys = ['SMTP_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    assert.equal(isVerificationEmailConfigured(), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
