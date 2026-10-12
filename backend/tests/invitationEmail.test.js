'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInvitationUrl, getFrontendBaseUrl } = require('../utils/invitationEmail');

test('invitation links keep one-time token in the URL fragment, not the request query', () => {
  const previousUrl = process.env.FRONTEND_URL;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  process.env.FRONTEND_URL = 'https://school.example.com';
  delete process.env.FRONTEND_ORIGIN;

  try {
    const token = 'a'.repeat(43);
    const url = new URL(createInvitationUrl(token));
    assert.equal(url.origin, 'https://school.example.com');
    assert.equal(url.pathname, '/accept-invitation');
    assert.equal(url.search, '');
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(url.hash, '#token=' + token);
  } finally {
    if (previousUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});

test('frontend base URL uses a configured origin and falls back safely for invalid values', () => {
  const previousUrl = process.env.FRONTEND_URL;
  const previousOrigin = process.env.FRONTEND_ORIGIN;
  try {
    process.env.FRONTEND_URL = 'javascript:alert(1)';
    process.env.FRONTEND_ORIGIN = 'https://allowed.example.com,https://secondary.example.com';
    assert.equal(getFrontendBaseUrl(), 'https://allowed.example.com');
    process.env.FRONTEND_URL = '';
    assert.equal(getFrontendBaseUrl(), 'https://allowed.example.com');
  } finally {
    if (previousUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousUrl;
    if (previousOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = previousOrigin;
  }
});
