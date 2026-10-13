'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIGRATION_COLLECTIONS,
  validateMigrationManifest,
} = require('../utils/legacyMigrationManifest');

const validManifest = () => ({
  version: 1,
  sourceSchoolLabel: 'Verified legacy school',
  organizationId: '665000000000000000000010',
  branchId: '665000000000000000000020',
  collections: Object.fromEntries(MIGRATION_COLLECTIONS.map((name) => [
    name,
    ['students', 'attendance', 'fees'].includes(name) ? 'legacy_unscoped' : 'skip',
  ])),
  confirmations: {
    sourceOwnershipVerified: true,
    backupRestoredInStaging: true,
    feeLedgerReviewed: true,
  },
});

test('explicit mapping manifest validates only when every collection has a mode', () => {
  const result = validateMigrationManifest(validManifest());
  assert.equal(result.valid, true);
  assert.equal(result.value.organizationId, '665000000000000000000010');
  assert.equal(result.value.branchId, '665000000000000000000020');
  assert.equal(result.value.collections.students, 'legacy_unscoped');
  assert.equal(result.value.collections.teachers, 'skip');
});

test('manifest rejects missing target IDs, source confirmation and backup validation', () => {
  const manifest = validManifest();
  manifest.organizationId = 'not-an-object-id';
  manifest.branchId = '';
  manifest.confirmations.sourceOwnershipVerified = false;
  manifest.confirmations.backupRestoredInStaging = false;
  const result = validateMigrationManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors.organizationId);
  assert.ok(result.errors.branchId);
  assert.ok(result.errors['confirmations.sourceOwnershipVerified']);
  assert.ok(result.errors['confirmations.backupRestoredInStaging']);
});

test('manifest requires students before mapping attendance or fees', () => {
  const manifest = validManifest();
  manifest.collections.students = 'skip';
  const result = validateMigrationManifest(manifest);
  assert.equal(result.valid, false);
  assert.match(result.errors['collections.attendance'], /student records/);
  assert.match(result.errors['collections.fees'], /student records/);
});

test('staff identities, guardian links and media cannot be enabled by this first-pass manifest', () => {
  for (const collection of ['teachers', 'users', 'guardians', 'childGuardianLinks', 'pdfResources', 'galleryPhotos', 'videos', 'reportCards', 'calendarEvents']) {
    const manifest = validManifest();
    manifest.collections[collection] = 'all';
    const result = validateMigrationManifest(manifest);
    assert.equal(result.valid, false, 'must fail for ' + collection);
    assert.ok(result.errors['collections.' + collection]);
  }
});

test('fee mapping requires an explicit fee-ledger review confirmation', () => {
  const manifest = validManifest();
  manifest.confirmations.feeLedgerReviewed = false;
  const result = validateMigrationManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(result.errors['confirmations.feeLedgerReviewed']);
});
