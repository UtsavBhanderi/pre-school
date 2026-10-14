'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionConfig, parseCanonicalHttpsOrigin } = require('../utils/productionConfig');

const validProductionConfig = {
  NODE_ENV: 'production',
  MONGO_URI: 'mongodb+srv://db.example.net/preschool',
  JWT_SECRET: 'production-jwt-secret-that-is-long-and-random-123456',
  PRIVATE_MEDIA_SECRET: 'different-private-media-secret-which-is-also-long-456',
  FRONTEND_ORIGIN: 'https://school.example.com,https://admin.example.com',
  FRONTEND_URL: 'https://school.example.com',
  API_PUBLIC_URL: 'https://api.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  EMAIL_USER: 'noreply@example.com',
  EMAIL_PASS: 'production-mail-password',
  EMAIL_FROM: 'School Office <noreply@example.com>',
};

test('valid production configuration passes all required secret, origin and delivery checks', () => {
  assert.deepEqual(validateProductionConfig(validProductionConfig), []);
});

test('development and test configurations are not subject to production-origin requirements', () => {
  assert.deepEqual(validateProductionConfig({ NODE_ENV: 'development' }), []);
  assert.deepEqual(validateProductionConfig({ NODE_ENV: 'test' }), []);
});

test('production configuration rejects short or placeholder secrets and secret reuse', () => {
  const shortSecrets = validateProductionConfig({
    ...validProductionConfig,
    JWT_SECRET: 'replace-with-a-long-random-secret',
    PRIVATE_MEDIA_SECRET: 'replace-with-a-long-random-secret',
  });
  assert.ok(shortSecrets.some((error) => error.includes('JWT_SECRET')));
  assert.ok(shortSecrets.some((error) => error.includes('PRIVATE_MEDIA_SECRET')));
  assert.ok(shortSecrets.some((error) => error.includes('different from JWT_SECRET')));
});

test('production configuration rejects wildcard, HTTP, localhost and path-based origins', () => {
  const errors = validateProductionConfig({
    ...validProductionConfig,
    FRONTEND_ORIGIN: '*',
    FRONTEND_URL: 'http://localhost:5173',
    API_PUBLIC_URL: 'https://api.example.com/private/path',
  });
  assert.ok(errors.some((error) => error.includes('wildcard CORS')));
  assert.ok(errors.some((error) => error.includes('FRONTEND_URL must use HTTPS')));
  assert.ok(errors.some((error) => error.includes('FRONTEND_URL cannot point to localhost')));
  assert.ok(errors.some((error) => error.includes('API_PUBLIC_URL must contain only the canonical origin')));
});

test('production CORS origins must match the browser origin exactly', () => {
  const errors = validateProductionConfig({
    ...validProductionConfig,
    FRONTEND_ORIGIN: 'https://school.example.com/',
  });
  assert.ok(errors.some((error) => error.includes('FRONTEND_ORIGIN entry 1 must contain only the canonical origin')));
});

test('production configuration requires an external MongoDB endpoint and working email settings', () => {
  const errors = validateProductionConfig({
    ...validProductionConfig,
    MONGO_URI: 'mongodb://127.0.0.1:27017/preschool',
    SMTP_HOST: '',
    SMTP_PORT: 'not-a-port',
    EMAIL_USER: '',
    EMAIL_PASS: '',
    EMAIL_FROM: 'not-an-email',
  });
  assert.ok(errors.some((error) => error.includes('MONGO_URI cannot point to localhost')));
  assert.ok(errors.some((error) => error.includes('SMTP_HOST')));
  assert.ok(errors.some((error) => error.includes('SMTP_PORT')));
  assert.ok(errors.some((error) => error.includes('EMAIL_USER')));
  assert.ok(errors.some((error) => error.includes('EMAIL_PASS')));
  assert.ok(errors.some((error) => error.includes('EMAIL_FROM')));
});

test('origin validation reports missing or invalid URLs without throwing', () => {
  const errors = [];
  assert.equal(parseCanonicalHttpsOrigin('', 'FRONTEND_URL', errors), null);
  assert.ok(errors.some((error) => error.includes('FRONTEND_URL is required')));
  const errors2 = [];
  assert.equal(parseCanonicalHttpsOrigin('not a URL', 'API_PUBLIC_URL', errors2), null);
  assert.ok(errors2.some((error) => error.includes('API_PUBLIC_URL must be a valid HTTPS origin')));
});
