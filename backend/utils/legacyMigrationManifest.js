'use strict';

const MIGRATION_COLLECTIONS = [
  'students',
  'attendance',
  'fees',
  'teachers',
  'users',
  'guardians',
  'childGuardianLinks',
  'reportCards',
  'calendarEvents',
  'pdfResources',
  'galleryPhotos',
  'videos',
];

const SKIP_ONLY_COLLECTIONS = new Set([
  'teachers',
  'users',
  'guardians',
  'childGuardianLinks',
  'reportCards',
  'calendarEvents',
  'pdfResources',
  'galleryPhotos',
  'videos',
]);

function validateMigrationManifest(manifest = {}) {
  const errors = {};
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: { manifest: 'The mapping manifest must be a JSON object.' } };
  }

  if (manifest.version !== 1) errors.version = 'Manifest version must be 1.';
  const sourceSchoolLabel = typeof manifest.sourceSchoolLabel === 'string'
    ? manifest.sourceSchoolLabel.trim()
    : '';
  if (sourceSchoolLabel.length < 2 || sourceSchoolLabel.length > 120) {
    errors.sourceSchoolLabel = 'Enter the verified legacy school label (2 to 120 characters).';
  }

  const objectId = /^[a-f\d]{24}$/i;
  const organizationId = String(manifest.organizationId || '').trim();
  const branchId = String(manifest.branchId || '').trim();
  if (!objectId.test(organizationId)) errors.organizationId = 'Provide an explicit 24-character target organization ID.';
  if (!objectId.test(branchId)) errors.branchId = 'Provide an explicit 24-character target branch ID.';

  const sourceModes = manifest.collections && typeof manifest.collections === 'object' && !Array.isArray(manifest.collections)
    ? manifest.collections
    : {};
  for (const collection of MIGRATION_COLLECTIONS) {
    const mode = sourceModes[collection];
    if (!['legacy_unscoped', 'skip'].includes(mode)) {
      errors['collections.' + collection] = 'Set ' + collection + ' to "legacy_unscoped" or "skip" explicitly.';
    } else if (SKIP_ONLY_COLLECTIONS.has(collection) && mode !== 'skip') {
      errors['collections.' + collection] = collection + ' must remain "skip" until identity, media, or reference mapping has its own approved process.';
    }
  }

  if (sourceModes.attendance === 'legacy_unscoped' && sourceModes.students !== 'legacy_unscoped') {
    errors['collections.attendance'] = 'Attendance can be mapped only when its student records are explicitly mapped too.';
  }
  if (sourceModes.fees === 'legacy_unscoped' && sourceModes.students !== 'legacy_unscoped') {
    errors['collections.fees'] = 'Fee records can be mapped only when their student records are explicitly mapped too.';
  }

  const confirmations = manifest.confirmations && typeof manifest.confirmations === 'object' && !Array.isArray(manifest.confirmations)
    ? manifest.confirmations
    : {};
  if (confirmations.sourceOwnershipVerified !== true) {
    errors['confirmations.sourceOwnershipVerified'] = 'Confirm that all selected legacy records belong to the declared school before assigning them to a tenant.';
  }
  if (confirmations.backupRestoredInStaging !== true) {
    errors['confirmations.backupRestoredInStaging'] = 'Confirm that a backup was restored and validated in staging.';
  }
  if (sourceModes.fees === 'legacy_unscoped' && confirmations.feeLedgerReviewed !== true) {
    errors['confirmations.feeLedgerReviewed'] = 'Confirm that the legacy fee ledger was reviewed before planning fee migration.';
  }

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      version: 1,
      sourceSchoolLabel,
      organizationId,
      branchId,
      collections: Object.fromEntries(MIGRATION_COLLECTIONS.map((collection) => [collection, sourceModes[collection]])),
      confirmations: {
        sourceOwnershipVerified: true,
        backupRestoredInStaging: true,
        feeLedgerReviewed: confirmations.feeLedgerReviewed === true,
      },
    },
  };
}

module.exports = { MIGRATION_COLLECTIONS, SKIP_ONLY_COLLECTIONS, validateMigrationManifest };
