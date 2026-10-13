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


function isFullyUnscoped(record) {
  return !record?.organizationId && !record?.branchId;
}

function recordId(record) {
  return record?._id === undefined || record?._id === null ? '' : String(record._id);
}

function evaluateMigrationManifest({
  manifest,
  students = [],
  attendance = [],
  fees = [],
  teachers = [],
  users = [],
  guardians = [],
  childGuardianLinks = [],
  reportCards = [],
  calendarEvents = [],
  pdfResources = [],
  galleryPhotos = [],
  videos = [],
  tenantClasses = [],
  organizations = [],
  branches = [],
  issuesByCode = {},
} = {}) {
  const errors = [];
  const warnings = [];
  const organization = organizations.find((item) => String(item._id) === manifest.organizationId);
  const branch = branches.find((item) => String(item._id) === manifest.branchId);

  if (!organization || organization.status !== 'active') {
    errors.push({ code: 'target_organization_unavailable', count: 1 });
  }
  if (!branch || branch.status !== 'active' || String(branch.organizationId) !== manifest.organizationId) {
    errors.push({ code: 'target_branch_unavailable_or_wrong_organization', count: 1 });
  }

  const recordsByCollection = {
    students, attendance, fees, teachers, users, guardians, childGuardianLinks,
    reportCards, calendarEvents, pdfResources, galleryPhotos, videos,
  };
  const scopeByCollection = recordsByCollection;
  const collectionPlan = {};
  for (const collection of MIGRATION_COLLECTIONS) {
    const mode = manifest.collections[collection];
    const records = recordsByCollection[collection] || [];
    const scopedRecords = scopeByCollection[collection] || [];
    const fullyUnscoped = scopedRecords.filter(isFullyUnscoped).length;
    const partiallyScoped = scopedRecords.filter((item) =>
      Boolean(item?.organizationId) !== Boolean(item?.branchId)
    ).length;
    const fullyScoped = scopedRecords.length - fullyUnscoped - partiallyScoped;
    collectionPlan[collection] = {
      mode,
      sourceRecords: records.length,
      selectedLegacyUnscopedRecords: mode === 'legacy_unscoped' ? fullyUnscoped : 0,
      leftUnchangedByPlan: records.length - (mode === 'legacy_unscoped' ? fullyUnscoped : 0),
      fullyUnscopedRecords: fullyUnscoped,
      fullyScopedRecords: fullyScoped,
      partiallyScopedRecords: partiallyScoped,
    };

    if (mode === 'legacy_unscoped' && partiallyScoped > 0) {
      errors.push({
        code: collection + '_contains_partially_scoped_records',
        count: partiallyScoped,
      });
    }
  }

  const selectedStudentIds = new Set(
    students.filter(isFullyUnscoped).map(recordId)
  );
  const selectedStudentAdmissions = new Map();
  for (const studentRecord of students.filter(isFullyUnscoped)) {
    const admissionNumber = String(studentRecord.stuNo || '').trim();
    if (!admissionNumber) continue;
    const list = selectedStudentAdmissions.get(admissionNumber) || [];
    list.push(studentRecord);
    selectedStudentAdmissions.set(admissionNumber, list);
  }

  if (manifest.collections.attendance === 'legacy_unscoped') {
    let incompatibleAttendanceRecords = 0;
    for (const record of attendance.filter(isFullyUnscoped)) {
      const entries = Array.isArray(record.studentDetails) ? record.studentDetails : [];
      if (entries.some((entry) => {
        const childId = recordId({ _id: entry?.studentId?._id || entry?.studentId });
        return !childId || !selectedStudentIds.has(childId);
      })) {
        incompatibleAttendanceRecords += 1;
      }
    }
    if (incompatibleAttendanceRecords) {
      errors.push({
        code: 'attendance_references_children_outside_selected_legacy_cohort',
        count: incompatibleAttendanceRecords,
      });
    }
  }

  if (manifest.collections.fees === 'legacy_unscoped') {
    let incompatibleFeeRecords = 0;
    for (const fee of fees.filter(isFullyUnscoped)) {
      const admissionNumber = String(fee.stuNo || '').trim();
      const matches = admissionNumber ? (selectedStudentAdmissions.get(admissionNumber) || []) : [];
      if (matches.length !== 1) incompatibleFeeRecords += 1;
    }
    if (incompatibleFeeRecords) {
      errors.push({
        code: 'fee_records_do_not_resolve_to_one_selected_legacy_student',
        count: incompatibleFeeRecords,
      });
    }
  }

  if (manifest.collections.students === 'legacy_unscoped') {
    const activeClasses = new Set(
      tenantClasses
        .filter((item) =>
          String(item.organizationId) === manifest.organizationId &&
          String(item.branchId) === manifest.branchId &&
          item.status === 'active'
        )
        .map((item) => String(item.name || '').trim())
    );
    const missingClassNames = [...new Set(students
      .filter(isFullyUnscoped)
      .map((item) => String(item.standard || '').trim())
      .filter((name) => name && !activeClasses.has(name)))];
    if (missingClassNames.length) {
      errors.push({
        code: 'target_branch_missing_active_class_configuration',
        count: missingClassNames.length,
        classNames: missingClassNames.slice(0, 20),
      });
    }
  }

  function selectedDataIssueCount(prefix, scopeCode, mode) {
    if (mode !== 'legacy_unscoped') return 0;
    return Object.entries(issuesByCode).reduce((total, [code, count]) => {
      if (!code.startsWith(prefix) || code === scopeCode) return total;
      return total + Number(count || 0);
    }, 0);
  }

  const dataQualityIssues = {
    students: selectedDataIssueCount(
      'student_', 'student_requires_explicit_organization_branch_mapping', manifest.collections.students
    ),
    attendance: selectedDataIssueCount(
      'attendance_', 'attendance_requires_explicit_organization_branch_mapping', manifest.collections.attendance
    ),
    fees: selectedDataIssueCount(
      'fee_', 'fee_requires_explicit_organization_branch_mapping', manifest.collections.fees
    ),
  };
  const totalSelectedDataQualityIssues = Object.values(dataQualityIssues).reduce((sum, value) => sum + value, 0);
  if (totalSelectedDataQualityIssues) {
    warnings.push({
      code: 'selected_collections_have_data_quality_findings',
      count: totalSelectedDataQualityIssues,
      byCollection: dataQualityIssues,
    });
  }

  for (const collection of MIGRATION_COLLECTIONS) {
    if (manifest.collections[collection] === 'skip') {
      const count = collectionPlan[collection].sourceRecords;
      if (count) warnings.push({ code: 'collection_left_unchanged', collection, count });
    }
  }

  return {
    status: errors.length === 0 && totalSelectedDataQualityIssues === 0
      ? 'READY_FOR_MANUAL_REVIEW_ONLY'
      : 'BLOCKED_FOR_REVIEW',
    validTarget: organization?.status === 'active' &&
      branch?.status === 'active' &&
      String(branch?.organizationId) === manifest.organizationId,
    automaticMigrationAllowed: false,
    writesPerformed: false,
    sourceSchoolLabel: manifest.sourceSchoolLabel,
    target: {
      organizationId: manifest.organizationId,
      branchId: manifest.branchId,
    },
    collectionPlan,
    selectedDataQualityIssues: dataQualityIssues,
    totalSelectedDataQualityIssues,
    errors,
    warnings,
  };
}

module.exports = { MIGRATION_COLLECTIONS, SKIP_ONLY_COLLECTIONS, validateMigrationManifest, evaluateMigrationManifest };
