'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { CATEGORY_RULES } = require('../utils/tenantMediaFiles');
const {
  validMigrationBatchId,
  validStorageName,
  expectedSourceMapping,
  resolvePrivateAssetPath,
  summarizeVerification,
} = require('../utils/legacyMediaVerification');

const orgId = '665000000000000000000010';
const branchId = '665000000000000000000020';
const pngName = '01234567-89ab-cdef-0123-456789abcdef.png';

test('post-migration verifier requires a generated batch ID format', () => {
  assert.equal(validMigrationBatchId('media-0123456789abcdef01234567'), true);
  assert.equal(validMigrationBatchId('media-0123456789ABCDEF01234567'), false);
  assert.equal(validMigrationBatchId('0123456789abcdef01234567'), false);
  assert.equal(validMigrationBatchId('media-abc'), false);
});

test('storage names must be generated names and match category MIME rules', () => {
  assert.equal(validStorageName(pngName, 'child_photo', 'image/png', CATEGORY_RULES), true);
  assert.equal(validStorageName(pngName, 'child_photo', 'image/jpeg', CATEGORY_RULES), false);
  assert.equal(validStorageName('../private.png', 'child_photo', 'image/png', CATEGORY_RULES), false);
  assert.equal(validStorageName(pngName, 'learning_pdf', 'image/png', CATEGORY_RULES), false);
  assert.equal(validStorageName('thing.exe', 'learning_video', 'video/mp4', CATEGORY_RULES), false);
});

test('verifier maps only allowlisted source collection and fields', () => {
  assert.equal(expectedSourceMapping({
    migrationSourceCollection: 'students',
    migrationSourceField: 'studentPhoto',
  }).category, 'child_photo');
  assert.equal(expectedSourceMapping({
    migrationSourceCollection: 'users',
    migrationSourceField: 'avatar',
  }), null);
  assert.equal(expectedSourceMapping(null), null);
});

test('private asset path resolver rejects invalid IDs and path traversal', () => {
  const root = path.resolve('/tmp/test-tenant-media');
  const result = resolvePrivateAssetPath({
    mediaRoot: root,
    organizationId: orgId,
    branchId,
    storageName: pngName,
  });
  assert.deepEqual(result, {
    root,
    organizationRoot: path.join(root, orgId),
    branchRoot: path.join(root, orgId, branchId),
    filePath: path.join(root, orgId, branchId, pngName),
  });
  assert.equal(resolvePrivateAssetPath({ mediaRoot: root, organizationId: '../org', branchId, storageName: pngName }), null);
  assert.equal(resolvePrivateAssetPath({ mediaRoot: root, organizationId: orgId, branchId, storageName: '../secret.png' }), null);
  assert.equal(resolvePrivateAssetPath({ mediaRoot: root, organizationId: orgId, branchId: 'not-an-id', storageName: pngName }), null);
});

test('verification summary reports passed, warning and blocked records without record details', () => {
  assert.deepEqual(summarizeVerification([
    { status: 'ok', category: 'child_photo' },
    { status: 'warning', category: 'child_photo' },
    { status: 'blocked', category: 'learning_pdf' },
  ]), {
    checked: 3,
    passed: 1,
    warning: 1,
    blocked: 1,
    byCategory: { child_photo: 2, learning_pdf: 1 },
    byStatus: { ok: 1, warning: 1, blocked: 1 },
  });
});
