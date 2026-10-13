'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MIGRATION_COLLECTIONS,
  validateMigrationManifest,
  evaluateMigrationManifest,
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
    manifest.collections[collection] = 'legacy_unscoped';
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


function validReviewInputs() {
  const manifest = validManifest();
  const organizationId = manifest.organizationId;
  const branchId = manifest.branchId;
  const childId = '665000000000000000000030';
  const student = {
    _id: childId,
    stuNo: 'GR-001',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
  };
  return {
    manifest,
    students: [student],
    attendance: [{
      _id: '665000000000000000000031',
      date: new Date('2026-10-01T00:00:00.000Z'),
      standard: 'ENG JR.',
      studentDetails: [{ studentId: childId, status: 'present' }],
    }],
    fees: [{
      _id: '665000000000000000000032',
      stuNo: 'GR-001',
      standard: 'ENG JR.',
      batchYear: '2026-2027',
      totalStandardFees: 1000,
      totalFeesPaid: 0,
      totalFeesRemaining: 1000,
      discount: 0,
      paymentDetails: [],
    }],
    tenantClasses: [{
      _id: '665000000000000000000040',
      organizationId,
      branchId,
      name: 'ENG JR.',
      status: 'active',
    }],
    organizations: [{ _id: organizationId, status: 'active' }],
    branches: [{ _id: branchId, organizationId, status: 'active' }],
    issuesByCode: {},
  };
}

test('mapping review plan selects only legacy-unscoped records and never permits writes', () => {
  const input = validReviewInputs();
  const result = evaluateMigrationManifest(input);
  assert.equal(result.status, 'READY_FOR_MANUAL_REVIEW_ONLY');
  assert.equal(result.automaticMigrationAllowed, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.collectionPlan.students.selectedLegacyUnscopedRecords, 1);
  assert.equal(result.collectionPlan.attendance.selectedLegacyUnscopedRecords, 1);
  assert.equal(result.collectionPlan.fees.selectedLegacyUnscopedRecords, 1);
  assert.equal(result.collectionPlan.teachers.mode, 'skip');
});

test('mapping review is blocked when attendance points outside the chosen legacy student cohort', () => {
  const input = validReviewInputs();
  input.attendance[0].studentDetails.push({
    studentId: '665000000000000000000099',
    status: 'absent',
  });
  const result = evaluateMigrationManifest(input);
  assert.equal(result.status, 'BLOCKED_FOR_REVIEW');
  assert.equal(result.automaticMigrationAllowed, false);
  assert.ok(result.errors.some((error) => error.code === 'attendance_references_children_outside_selected_legacy_cohort'));
});

test('mapping review is blocked when the target branch belongs to a different organization', () => {
  const input = validReviewInputs();
  input.branches[0].organizationId = '665000000000000000000099';
  const result = evaluateMigrationManifest(input);
  assert.equal(result.validTarget, false);
  assert.equal(result.status, 'BLOCKED_FOR_REVIEW');
  assert.ok(result.errors.some((error) => error.code === 'target_branch_unavailable_or_wrong_organization'));
});

test('partially scoped records are not silently treated as legacy-unscoped records', () => {
  const input = validReviewInputs();
  input.students.push({
    _id: '665000000000000000000050',
    stuNo: 'GR-002',
    standard: 'ENG JR.',
    organizationId: input.manifest.organizationId,
  });
  const result = evaluateMigrationManifest(input);
  assert.equal(result.collectionPlan.students.selectedLegacyUnscopedRecords, 1);
  assert.equal(result.collectionPlan.students.partiallyScopedRecords, 1);
  assert.equal(result.status, 'BLOCKED_FOR_REVIEW');
});
