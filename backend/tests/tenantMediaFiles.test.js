'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CATEGORY_RULES,
  storageNameFor,
  safeDisplayName,
  matchesMediaSignature,
} = require('../utils/tenantMediaFiles');

const signatures = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  'image/webp': Buffer.from('RIFF0000WEBPdata'),
  'image/gif': Buffer.from('GIF89adata'),
  'application/pdf': Buffer.from('%PDF-1.7\n'),
  'video/mp4': Buffer.from('0000ftypisom'),
  'video/quicktime': Buffer.from('0000ftypqt  '),
  'video/webm': Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x00]),
};

test('every allowed category has a bounded upload size and an explicit MIME allowlist', () => {
  assert.deepEqual(Object.keys(CATEGORY_RULES).sort(), [
    'child_photo', 'gallery_image', 'learning_pdf', 'learning_video', 'staff_photo',
  ]);
  assert.equal(CATEGORY_RULES.child_photo.maxBytes, 5 * 1024 * 1024);
  assert.equal(CATEGORY_RULES.learning_video.maxBytes, 100 * 1024 * 1024);
  assert.equal(CATEGORY_RULES.learning_pdf.mimeExtensions['application/pdf'], '.pdf');
});

test('stored names are random, server-generated and use an allowlisted extension', () => {
  const first = storageNameFor('child_photo', 'image/jpeg');
  const second = storageNameFor('child_photo', 'image/jpeg');
  assert.match(first, /^[a-f\d-]{36}\.jpg$/i);
  assert.notEqual(first, second);
  assert.equal(storageNameFor('child_photo', 'application/pdf'), null);
  assert.equal(storageNameFor('unknown', 'image/jpeg'), null);
});

test('original file names are reduced to harmless display names', () => {
  assert.equal(safeDisplayName('../../child photo.jpg'), 'child photo.jpg');
  assert.equal(safeDisplayName('folder\\script<>.pdf'), 'script__.pdf');
  assert.equal(safeDisplayName(''), '');
});

test('upload signature checks reject files whose bytes do not match their declared MIME type', () => {
  for (const [mimeType, signature] of Object.entries(signatures)) {
    assert.equal(matchesMediaSignature(signature, mimeType), true, mimeType);
    assert.equal(matchesMediaSignature(Buffer.from('not a real file'), mimeType), false, mimeType);
  }
  assert.equal(matchesMediaSignature('not a buffer', 'image/png'), false);
  assert.equal(matchesMediaSignature(Buffer.alloc(0), 'application/zip'), false);
});
