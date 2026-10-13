'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');

const LEGACY_SOURCE_ROLES = new Set(['admin', 'teacher']);
const MAPPABLE_TENANT_ROLES = new Set([
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
]);
const DEFAULT_MAX_OPERATIONS = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idOf(value) {
  return value === undefined || value === null ? '' : String(value?._id || value);
}

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validObjectId(value) {
  return /^[0-9a-f]{24}$/i.test(String(value || ''));
}

function normalizeIdList(value) {
  return Array.isArray(value) ? [...new Set(value.map((item) => String(item).trim()))] : [];
}

function validateLegacyStaffManifest(input = {}) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { manifest: 'The staff mapping must be a JSON object.' } };
  }

  if (input.version !== 1) errors.version = 'Staff manifest version must be 1.';
  const sourceSchoolLabel = cleanText(input.sourceSchoolLabel, 120);
  if (sourceSchoolLabel.length < 2) errors.sourceSchoolLabel = 'Enter the verified legacy school label.';
  const organizationId = String(input.organizationId || '').trim().toLowerCase();
  const primaryBranchId = String(input.primaryBranchId || '').trim().toLowerCase();
  if (!validObjectId(organizationId)) errors.organizationId = 'Provide an explicit target organization ID.';
  if (!validObjectId(primaryBranchId)) errors.primaryBranchId = 'Provide an explicit primary target branch ID.';

  const confirmations = input.confirmations && typeof input.confirmations === 'object' && !Array.isArray(input.confirmations)
    ? input.confirmations
    : {};
  for (const flag of ['sourceOwnershipVerified', 'staffIdentityVerified', 'backupRestoredInStaging', 'classAssignmentsReviewed']) {
    if (confirmations[flag] !== true) {
      errors['confirmations.' + flag] = 'Confirm ' + flag + ' after review with the school owner.';
    }
  }

  const submitted = Array.isArray(input.staff) ? input.staff : [];
  if (submitted.length < 1 || submitted.length > 500) errors.staff = 'Map between 1 and 500 staff accounts per migration run.';
  const seenUsers = new Set();
  const seenTeachers = new Set();
  const staff = submitted.slice(0, 500).map((entry, index) => {
    const prefix = 'staff.' + index;
    const legacyUserId = String(entry?.legacyUserId || '').trim().toLowerCase();
    const expectedEmail = cleanText(entry?.expectedEmail, 254).toLowerCase();
    const expectedLegacyRole = cleanText(entry?.expectedLegacyRole, 30).toLowerCase();
    const role = cleanText(entry?.role, 40).toLowerCase();
    const branchIds = normalizeIdList(entry?.branchIds).map((id) => id.toLowerCase());
    const classNames = [...new Set((Array.isArray(entry?.classNames) ? entry.classNames : [])
      .map((name) => cleanText(name, 80)))];
    const legacyTeacherId = String(entry?.legacyTeacherId || '').trim().toLowerCase();

    if (!validObjectId(legacyUserId)) errors[prefix + '.legacyUserId'] = 'Provide a valid existing legacy User ID.';
    if (legacyUserId && seenUsers.has(legacyUserId)) errors[prefix + '.legacyUserId'] = 'A legacy account may appear only once in this manifest.';
    seenUsers.add(legacyUserId);

    if (!EMAIL_PATTERN.test(expectedEmail)) errors[prefix + '.expectedEmail'] = 'Provide the exact verified email for this legacy account.';
    if (!LEGACY_SOURCE_ROLES.has(expectedLegacyRole)) {
      errors[prefix + '.expectedLegacyRole'] = 'Only existing legacy admin and teacher accounts are eligible. Student accounts require the separate verified guardian invitation process.';
    }
    if (!MAPPABLE_TENANT_ROLES.has(role)) {
      errors[prefix + '.role'] = 'Choose a supported staff role. Ownership transfer and parent access are not supported by this importer.';
    }
    if (expectedLegacyRole === 'teacher' && role !== 'teacher') {
      errors[prefix + '.role'] = 'A legacy teacher account may only be mapped to the tenant teacher role.';
    }
    if (expectedLegacyRole === 'admin' && role === 'teacher') {
      errors[prefix + '.role'] = 'A legacy administrator cannot be silently downgraded to a teacher account by this import.';
    }
    if (!branchIds.length || branchIds.length > 25 || branchIds.some((id) => !validObjectId(id))) {
      errors[prefix + '.branchIds'] = 'Select 1 to 25 valid target branches explicitly.';
    }
    if (branchIds.length && !branchIds.includes(primaryBranchId)) {
      errors[prefix + '.branchIds'] = 'Every manifest must include the primary target branch in the assigned branch list.';
    }
    if (role === 'teacher') {
      if (classNames.length < 1 || classNames.length > 40 ||
          classNames.some((name) => name.length < 2 || name.length > 80)) {
        errors[prefix + '.classNames'] = 'Teacher access requires 1 to 40 explicitly configured class names.';
      }
    } else if (classNames.length) {
      errors[prefix + '.classNames'] = 'Class-level assignment is supported only for teacher mappings in this importer.';
    }

    if (role === 'teacher' && !legacyTeacherId) errors[prefix + '.legacyTeacherId'] = 'Map an existing teacher profile so the staff record is preserved.';
    if (legacyTeacherId && !validObjectId(legacyTeacherId)) {
      errors[prefix + '.legacyTeacherId'] = 'Provide a valid existing legacy Teacher profile ID.';
    }
    if (role !== 'teacher' && legacyTeacherId) {
      errors[prefix + '.legacyTeacherId'] = 'Only teacher-role mappings may import a legacy Teacher profile.';
    }
    if (legacyTeacherId && seenTeachers.has(legacyTeacherId)) {
      errors[prefix + '.legacyTeacherId'] = 'A legacy Teacher profile may be mapped only once.';
    }
    if (legacyTeacherId) seenTeachers.add(legacyTeacherId);

    return {
      legacyUserId,
      expectedEmail,
      expectedLegacyRole,
      role,
      branchIds,
      classNames,
      legacyTeacherId: legacyTeacherId || null,
      approvalNote: cleanText(entry?.approvalNote, 300),
    };
  });

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      version: 1,
      sourceSchoolLabel,
      organizationId,
      primaryBranchId,
      confirmations: {
        sourceOwnershipVerified: true,
        staffIdentityVerified: true,
        backupRestoredInStaging: true,
        classAssignmentsReviewed: true,
      },
      staff,
    },
  };
}

function profileFields(teacher, user, now) {
  const firstName = cleanText(teacher.firstName, 80);
  const middleName = cleanText(teacher.middleName, 80);
  const lastName = cleanText(teacher.lastName, 80);
  const displayName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  return {
    employeeCode: cleanText(teacher.GR_No, 80),
    firstName,
    middleName,
    lastName,
    displayName: displayName || cleanText(user.username, 160),
    email: cleanText(user.email, 254).toLowerCase(),
    phone: cleanText(teacher.RegisterPhoneNumber, 30),
    gender: ['Male', 'Female', 'Other'].includes(teacher.gender) ? teacher.gender : '',
    dateOfBirth: cleanText(teacher.dob, 40),
    address: cleanText(teacher.address, 500),
    importedFromLegacy: true,
    importedAt: now,
  };
}

function membershipScopeMatches(existing, item) {
  if (!existing || existing.status !== 'active' || existing.role !== item.role || existing.accessAllBranches === true) return false;
  const currentBranches = (existing.branchIds || []).map(idOf).sort();
  const desiredBranches = [...item.branchIds].sort();
  const currentClasses = (existing.classNames || []).map((name) => cleanText(name, 80)).sort();
  const desiredClasses = [...item.classNames].sort();
  return JSON.stringify(currentBranches) === JSON.stringify(desiredBranches) &&
    JSON.stringify(currentClasses) === JSON.stringify(desiredClasses) &&
    idOf(existing.organizationId) !== '';
}

function buildLegacyStaffMigrationPlan({
  manifest,
  organization,
  branches = [],
  users = [],
  memberships = [],
  teachers = [],
  tenantClasses = [],
  staffProfiles = [],
  approvedBy,
  now = new Date(),
  maxOperations = DEFAULT_MAX_OPERATIONS,
} = {}) {
  const errors = [];
  const organizationId = String(manifest?.organizationId || '').toLowerCase();
  const primaryBranchId = String(manifest?.primaryBranchId || '').toLowerCase();
  const approverId = idOf(approvedBy);
  if (!organization || idOf(organization) !== organizationId || organization.status !== 'active') {
    errors.push({ code: 'target_organization_unavailable_or_mismatched' });
  }
  if (!validObjectId(approverId)) errors.push({ code: 'approved_by_user_missing' });
  if (!Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 5000) {
    errors.push({ code: 'max_operations_out_of_range' });
  }

  const branchById = new Map(branches.map((item) => [idOf(item).toLowerCase(), item]));
  const userById = new Map(users.map((item) => [idOf(item).toLowerCase(), item]));
  const membershipByUser = new Map();
  for (const member of memberships) {
    if (idOf(member.organizationId).toLowerCase() !== organizationId) continue;
    membershipByUser.set(idOf(member.userId).toLowerCase(), member);
  }
  const teacherById = new Map(teachers.map((teacher) => [idOf(teacher).toLowerCase(), teacher]));
  const profileByLegacySourceAndBranch = new Map();
  for (const profile of staffProfiles) {
    const key = idOf(profile.legacySourceTeacherId).toLowerCase() + '|' + idOf(profile.branchId).toLowerCase();
    if (idOf(profile.organizationId).toLowerCase() === organizationId && idOf(profile.legacySourceTeacherId)) {
      profileByLegacySourceAndBranch.set(key, profile);
    }
  }

  const membershipsToCreate = [];
  const profilesToCreate = [];
  const alreadySatisfiedMemberships = [];
  const alreadySatisfiedProfiles = [];
  const usedTeacherIds = new Set();

  const primaryBranch = branchById.get(primaryBranchId);
  if (!primaryBranch || primaryBranch.status !== 'active' || idOf(primaryBranch.organizationId).toLowerCase() !== organizationId) {
    errors.push({ code: 'primary_branch_unavailable_or_wrong_organization' });
  }

  const activeClassMap = new Map();
  for (const item of tenantClasses) {
    if (idOf(item.organizationId).toLowerCase() !== organizationId || item.status !== 'active') continue;
    const key = idOf(item.branchId).toLowerCase();
    const list = activeClassMap.get(key) || [];
    list.push(cleanText(item.name, 80));
    activeClassMap.set(key, list);
  }

  for (const item of manifest?.staff || []) {
    const user = userById.get(item.legacyUserId);
    if (!user) {
      errors.push({ code: 'legacy_user_not_found', recordRef: item.legacyUserId.slice(0, 10) });
      continue;
    }
    const userEmail = cleanText(user.email, 254).toLowerCase();
    if (userEmail !== item.expectedEmail) {
      errors.push({ code: 'legacy_user_email_confirmation_mismatch', recordRef: item.legacyUserId.slice(0, 10) });
    }
    if (cleanText(user.role, 30).toLowerCase() !== item.expectedLegacyRole) {
      errors.push({ code: 'legacy_user_role_confirmation_mismatch', recordRef: item.legacyUserId.slice(0, 10) });
    }

    const validAssignedBranches = [];
    for (const assignedBranchId of item.branchIds) {
      const targetBranch = branchById.get(assignedBranchId);
      if (!targetBranch || targetBranch.status !== 'active' ||
          idOf(targetBranch.organizationId).toLowerCase() !== organizationId) {
        errors.push({ code: 'assigned_branch_unavailable_or_wrong_organization', recordRef: item.legacyUserId.slice(0, 10) });
        continue;
      }
      validAssignedBranches.push(targetBranch);
      if (item.role === 'teacher') {
        const available = activeClassMap.get(assignedBranchId) || [];
        const missing = item.classNames.filter((name) => !available.includes(name));
        if (missing.length) {
          errors.push({
            code: 'teacher_class_not_configured_at_assigned_branch',
            recordRef: item.legacyUserId.slice(0, 10),
            count: missing.length,
          });
        }
      }
    }
    if (!validAssignedBranches.some((item) => idOf(item).toLowerCase() === primaryBranchId)) {
      errors.push({ code: 'staff_primary_branch_missing_from_assigned_branches', recordRef: item.legacyUserId.slice(0, 10) });
    }

    const existingMembership = membershipByUser.get(item.legacyUserId);
    if (existingMembership) {
      if (!membershipScopeMatches(existingMembership, item)) {
        errors.push({ code: 'target_membership_conflicts_with_explicit_legacy_mapping', recordRef: item.legacyUserId.slice(0, 10) });
      } else {
        alreadySatisfiedMemberships.push(item.legacyUserId);
      }
    } else {
      membershipsToCreate.push({
        organizationId: organization._id,
        userId: user._id,
        role: item.role,
        branchIds: validAssignedBranches.map((targetBranch) => targetBranch._id),
        guardianIds: [],
        classNames: item.classNames,
        accessAllBranches: false,
        status: 'active',
        invitedBy: approvedBy?._id || approvedBy,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (item.legacyTeacherId) {
      if (usedTeacherIds.has(item.legacyTeacherId)) {
        errors.push({ code: 'legacy_teacher_profile_mapped_twice', recordRef: item.legacyTeacherId.slice(0, 10) });
        continue;
      }
      usedTeacherIds.add(item.legacyTeacherId);
      const teacher = teacherById.get(item.legacyTeacherId);
      if (!teacher) {
        errors.push({ code: 'legacy_teacher_profile_not_found', recordRef: item.legacyTeacherId.slice(0, 10) });
        continue;
      }
      if (teacher.organizationId || teacher.branchId) {
        errors.push({ code: 'legacy_teacher_profile_already_scoped_or_partially_scoped', recordRef: item.legacyTeacherId.slice(0, 10) });
      }
      const teacherEmail = cleanText(teacher.Email, 254).toLowerCase();
      if (teacherEmail && teacherEmail !== item.expectedEmail) {
        errors.push({ code: 'teacher_profile_email_differs_from_verified_user', recordRef: item.legacyTeacherId.slice(0, 10) });
      }
      const fields = profileFields(teacher, user, now);
      if (!fields.displayName) errors.push({ code: 'legacy_teacher_profile_name_missing', recordRef: item.legacyTeacherId.slice(0, 10) });

      for (const targetBranch of validAssignedBranches) {
        const key = item.legacyTeacherId + '|' + idOf(targetBranch).toLowerCase();
        const existingProfile = profileByLegacySourceAndBranch.get(key);
        if (existingProfile) {
          if (idOf(existingProfile.userId) !== idOf(user) ||
              idOf(existingProfile.organizationId) !== organizationId ||
              idOf(existingProfile.branchId) !== idOf(targetBranch)) {
            errors.push({ code: 'tenant_staff_profile_conflicts_with_explicit_mapping', recordRef: item.legacyTeacherId.slice(0, 10) });
          } else {
            alreadySatisfiedProfiles.push(key);
          }
        } else {
          profilesToCreate.push({
            organizationId: organization._id,
            branchId: targetBranch._id,
            userId: user._id,
            legacySourceTeacherId: teacher._id,
            ...fields,
            status: 'active',
            createdBy: approvedBy?._id || approvedBy,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }
  }

  const operationCount = membershipsToCreate.length + profilesToCreate.length + 2;
  if (operationCount > maxOperations) {
    errors.push({ code: 'migration_operation_limit_exceeded', count: operationCount, maxOperations });
  }

  const mappingFingerprint = (manifest?.staff || []).map((item) => ({
    legacyUserId: item.legacyUserId,
    expectedEmail: item.expectedEmail,
    expectedLegacyRole: item.expectedLegacyRole,
    role: item.role,
    branchIds: [...item.branchIds].sort(),
    classNames: [...item.classNames].sort(),
    legacyTeacherId: item.legacyTeacherId || '',
  })).sort((a, b) => a.legacyUserId.localeCompare(b.legacyUserId));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({
    migrationType: 'legacy-staff-migration-v1',
    sourceSchoolLabel: manifest?.sourceSchoolLabel,
    organizationId,
    primaryBranchId,
    mappingFingerprint,
  })).digest('hex');

  const noOp = membershipsToCreate.length === 0 && profilesToCreate.length === 0 && errors.length === 0;
  return {
    valid: errors.length === 0,
    noOp,
    errors,
    fingerprint,
    summary: {
      sourceSchoolLabel: safeTextForReport(manifest?.sourceSchoolLabel),
      organizationId,
      primaryBranchId,
      staffMappingsReviewed: (manifest?.staff || []).length,
      membershipsToCreate: membershipsToCreate.length,
      membershipsAlreadySatisfied: alreadySatisfiedMemberships.length,
      teacherProfilesToCreate: profilesToCreate.length,
      teacherProfilesAlreadySatisfied: alreadySatisfiedProfiles.length,
      databaseOperations: operationCount,
      maximumDatabaseOperations: maxOperations,
    },
    membershipsToCreate,
    profilesToCreate,
    alreadySatisfiedMemberships,
    alreadySatisfiedProfiles,
  };
}

function safeTextForReport(value) {
  // Source labels are intentionally operator-entered public school labels, not
  // family/member PII. Keep bounded for logs and audit.
  return cleanText(value, 120);
}

module.exports = {
  DEFAULT_MAX_OPERATIONS,
  LEGACY_SOURCE_ROLES,
  MAPPABLE_TENANT_ROLES,
  validateLegacyStaffManifest,
  buildLegacyStaffMigrationPlan,
};
