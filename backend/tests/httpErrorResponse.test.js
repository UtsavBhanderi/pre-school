'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getHttpErrorResponse } = require('../utils/httpErrorResponse');

test('maps oversized uploads to 413 without exposing internal error details', () => {
  assert.deepEqual(getHttpErrorResponse({
    code: 'LIMIT_FILE_SIZE',
    message: 'Internal path /srv/app/uploads/private.jpg',
  }), {
    status: 413,
    body: { message: 'The uploaded file is too large. Choose a smaller file and try again.' },
  });
});

test('maps other multer errors to a safe client response', () => {
  assert.deepEqual(getHttpErrorResponse({ code: 'LIMIT_UNEXPECTED_FILE', message: 'unexpected field secret' }), {
    status: 400,
    body: { message: 'The uploaded file could not be accepted. Check the selected file and try again.' },
  });
});

test('maps malformed and oversized JSON to appropriate safe statuses', () => {
  assert.equal(getHttpErrorResponse({ type: 'entity.parse.failed', message: 'raw parser failure' }).status, 400);
  assert.equal(getHttpErrorResponse({ type: 'entity.too.large' }).status, 413);
  assert.equal(getHttpErrorResponse({ type: 'charset.unsupported' }).status, 415);
});

test('maps blocked CORS origins to 403', () => {
  assert.equal(getHttpErrorResponse({ code: 'CORS_ORIGIN_DENIED', message: 'internal origin detail' }).status, 403);
});

test('returns generic 500 for unknown errors and never exposes their message', () => {
  const response = getHttpErrorResponse(new Error('MongoServerError: duplicate key index secret_hash'));
  assert.equal(response.status, 500);
  assert.equal(response.body.message.includes('MongoServerError'), false);
});
