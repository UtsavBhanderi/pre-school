'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COLLECTIONS,
  validateLegacyMediaManifest,
  mappingFor,
  parseLegacyUploadReference,
  inferLegacyMimeType,
  displayNameFor,
  createBatchId,
} = require('../utils/legacyMediaMigration');

const ids = {
  organizationId: '665000000000000000000010',
  branchId: '665000000000000000000020',
  childId: '665000000000000000000030',
  teacherId: '665000000000000000000040',
  staffUserId: '665000000000000000000050',
};

function manifest(items) {
  return {
    version: 1,
    sourceSchoolLabel: 'Verified legacy preschool',
    organizationId: ids.organizationId,
    confirmations: {
      sourceOwnershipVerified: false,
      backupRestoredInStaging: false,
      resourceOwnershipReviewed: false,
      photoConsentReviewed: false,
    },
    items,
  };
}

test('legacy media mappings are explicit and limited to supported local fields', () => {
  assert.equal(mappingFor('students', 'studentPhoto').category, 'child_photo');
  assert.equal(mappingFor('students', 'studentPhoto').parentConsentEligible, true);
  assert.equal(mappingFor('students', 'motherPhoto').parentConsentEligible, false);
  assert.equal(mappingFor('teachers', 'selfPhoto').category, 'staff_photo');
  assert.equal(mappingFor('photos', 'url').category, 'gallery_image');
  assert.equal(mappingFor('pdfs', 'filePath').category, 'learning_pdf');
  assert.equal(mappingFor('videos', 'filePath').category, 'learning_video');
  assert.equal(mappingFor('students', 'studentAadharNo'), null);
  assert.equal(mappingFor('users', 'avatar'), null);
  assert.deepEqual(Object.keys(COLLECTIONS).sort(), ['pdfs', 'photos', 'students', 'teachers', 'videos']);
});

test('manifest validation accepts an explicit dry-run mapping without claiming approvals', () => {
  const result = validateLegacyMediaManifest(manifest([{
    sourceCollection: 'students',
    sourceDocumentId: ids.childId,
    sourceField: 'studentPhoto',
    branchId: ids.branchId,
  }]));
  assert.equal(result.valid, true);
  assert.equal(result.value.confirmations.backupRestoredInStaging, false);
  assert.equal(result.value.items.length, 1);
  assert.equal(result.value.items[0].sourceDocumentId, ids.childId);
  assert.equal(result.value.items[0].allowParentAccess, false);
});

test('manifest validation rejects invalid IDs, unknown media fields, and duplicate mappings', () => {
  const result = validateLegacyMediaManifest(manifest([
    {
      sourceCollection: 'students',
      sourceDocumentId: ids.childId,
      sourceField: 'studentPhoto',
      branchId: ids.branchId,
    },
    {
      sourceCollection: 'students',
      sourceDocumentId: ids.childId,
      sourceField: 'studentPhoto',
      branchId: ids.branchId,
    },
    {
      sourceCollection: 'students',
      sourceDocumentId: 'not-an-id',
      sourceField: 'studentAadharNo',
      branchId: 'wrong',
    },
  ]));
  assert.equal(result.valid, false);
  assert.ok(result.errors['items.1']);
  assert.ok(result.errors['items.2']);
});

test('teacher photo migration requires an explicit target tenant staff identity', () => {
  const withoutUser = validateLegacyMediaManifest(manifest([{
    sourceCollection: 'teachers',
    sourceDocumentId: ids.teacherId,
    sourceField: 'selfPhoto',
    branchId: ids.branchId,
  }]));
  assert.equal(withoutUser.valid, false);
  assert.match(withoutUser.errors['items.0'], /staff user ID/);

  const withUser = validateLegacyMediaManifest(manifest([{
    sourceCollection: 'teachers',
    sourceDocumentId: ids.teacherId,
    sourceField: 'selfPhoto',
    branchId: ids.branchId,
    staffUserId: ids.staffUserId,
  }]));
  assert.equal(withUser.valid, true);
});

test('parent visibility may only be requested for a student photo', () => {
  const denied = validateLegacyMediaManifest(manifest([{
    sourceCollection: 'photos',
    sourceDocumentId: ids.childId,
    sourceField: 'url',
    branchId: ids.branchId,
    allowParentAccess: true,
  }]));
  assert.equal(denied.valid, false);
  assert.match(denied.errors['items.0'], /only be requested for the student photo/);

  const allowedToRequest = validateLegacyMediaManifest(manifest([{
    sourceCollection: 'students',
    sourceDocumentId: ids.childId,
    sourceField: 'studentPhoto',
    branchId: ids.branchId,
    allowParentAccess: true,
  }]));
  assert.equal(allowedToRequest.valid, true);
});

test('local upload references require the expected folder and a simple allowlisted filename', () => {
  const result = parseLegacyUploadReference('/uploads/students/123-child.jpg', 'students');
  assert.deepEqual(result, {
    status: 'local',
    folder: 'students',
    filename: '123-child.jpg',
    relativePath: 'students/123-child.jpg',
    mimeType: 'image/jpeg',
  });
  assert.equal(parseLegacyUploadReference('uploads/pdf/worksheet.pdf', 'pdf').status, 'local');
  assert.equal(parseLegacyUploadReference('/uploads/video/class.mp4', 'pdf').reason, 'unexpected_source_folder');
  assert.equal(parseLegacyUploadReference('/uploads/students/%2e%2e%2fsecret.jpg', 'students').status, 'invalid');
  assert.equal(parseLegacyUploadReference('/uploads/students/../secret.jpg', 'students').status, 'invalid');
  assert.equal(parseLegacyUploadReference('/uploads/students/.hidden.jpg', 'students').status, 'invalid');
});

test('absolute file references must match the configured canonical API origin', () => {
  assert.equal(
    parseLegacyUploadReference('https://api.school.example/uploads/gallery/event.jpg', 'gallery', 'https://api.school.example/').status,
    'local',
  );
  assert.deepEqual(
    parseLegacyUploadReference('https://untrusted.example/uploads/gallery/event.jpg', 'gallery', 'https://api.school.example'),
    { status: 'skip', reason: 'external_reference' },
  );
  assert.equal(
    parseLegacyUploadReference('https://api.school.example/uploads/gallery/event.jpg', 'gallery', '').status,
    'skip',
  );
});

test('blank and external resources are skips rather than silently downloaded', () => {
  assert.deepEqual(parseLegacyUploadReference('', 'students'), { status: 'skip', reason: 'empty_reference' });
  assert.deepEqual(parseLegacyUploadReference('https://cdn.example.com/worksheet.pdf', 'pdf', 'https://api.school.example'), { status: 'skip', reason: 'external_reference' });
  assert.equal(parseLegacyUploadReference('uploads/students/script.exe', 'students').status, 'invalid');
});

test('MIME inference and generated display names do not reuse potentially identifying original filenames', () => {
  assert.equal(inferLegacyMimeType('image.JPEG'), 'image/jpeg');
  assert.equal(inferLegacyMimeType('lesson.MP4'), 'video/mp4');
  assert.equal(inferLegacyMimeType('thing.exe'), '');
  const name = displayNameFor({
    sourceCollection: 'students',
    sourceDocumentId: ids.childId,
    sourceField: 'studentPhoto',
  }, 'image/jpeg');
  assert.equal(name.includes(ids.childId), false);
  assert.match(name, /^Migrated students 66500000 studentPhoto\.jpg$/);
});

test('batch IDs are deterministic per manifest and change ticket without containing the ticket', () => {
  const first = createBatchId('abc123', 'CHG-2026-010');
  assert.equal(first, createBatchId('abc123', 'CHG-2026-010'));
  assert.notEqual(first, createBatchId('abc123', 'CHG-2026-011'));
  assert.doesNotMatch(first, /CHG-2026/);
});
