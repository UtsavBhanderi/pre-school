#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const {
  DEFAULT_MAX_OPERATIONS,
  validateLegacyStaffManifest,
  buildLegacyStaffMigrationPlan,
} = require('./utils/legacyStaffMigration');

const USAGE = `Usage:
  npm run migration:staff -- --manifest ./legacy-staff-identity-manifest.json
  npm run migration:staff -- --manifest ./legacy-staff-identity-manifest.json --json

The command is read-only by default. Apply requires:
  NODE_ENV=staging
  SAAS_MIGRATION_ENV=staging
  ALLOW_LEGACY_STAFF_MIGRATION=true

Then, on a disposable staging database with a verified backup:
  npm run migration:staff -- --manifest ./legacy-staff-identity-manifest.json --apply \
    --confirm-source-label "Verified legacy school" \
    --confirm-organization <24-hex-org-id> \
    --confirm-primary-branch <24-hex-branch-id> \
    --approved-by <24-hex-owner-user-id> \
    --change-ticket CHG-2026-002

The mapper reuses exact existing User IDs; it does not create accounts, change
passwords, infer roles, grant ownership, or convert old student accounts to
parents. Teacher profiles are copied to a tenant-specific profile collection;
the source Teacher and User documents are not modified. All apply writes,
including the migration ledger and audit event, occur in one MongoDB transaction.`;

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function optionValue(option) {
  const args = process.argv.slice(2);
  const equalForm = args.find((argument) => argument.startsWith(option + '='));
  if (equalForm) return equalForm.slice(option.length + 1);
  const index = args.indexOf(option);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : null;
}

function validObjectId(value) {
  return /^[0-9a-f]{24}$/i.test(String(value || ''));
}

function report(result) {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('VERIFIED LEGACY STAFF IDENTITY MIGRATION');
  console.log('Mode: ' + (result.applyRequested ? 'EXPLICIT APPLY REQUEST' : 'DRY RUN'));
  console.log('Writes performed: ' + (result.writesPerformed ? 'YES' : 'NO'));
  console.log('Status: ' + result.status);
  if (result.summary) {
    console.log('Source label: ' + result.summary.sourceSchoolLabel);
    console.log('Organization: ' + result.summary.organizationId);
    console.log('Primary branch: ' + result.summary.primaryBranchId);
    console.log('Staff mappings reviewed: ' + result.summary.staffMappingsReviewed);
    console.log('Memberships to create: ' + result.summary.membershipsToCreate);
    console.log('Memberships already matching: ' + result.summary.membershipsAlreadySatisfied);
    console.log('Teacher profiles to create: ' + result.summary.teacherProfilesToCreate);
    console.log('Teacher profiles already imported: ' + result.summary.teacherProfilesAlreadySatisfied);
    console.log('Maximum database operations: ' + result.summary.databaseOperations + ' / ' + result.summary.maximumDatabaseOperations);
  }
  for (const blocker of result.errors || []) {
    console.log('- ' + blocker.code +
      (blocker.count ? ' (' + blocker.count + ')' : '') +
      (blocker.recordRef ? ' [record ' + blocker.recordRef + ']' : ''));
  }
  if (result.message) console.log('
' + result.message);
}

function modelSet() {
  const User = require('./models/User');
  const Organization = require('./models/Organization');
  const Branch = require('./models/Branch');
  const OrganizationMembership = require('./models/OrganizationMembership');
  const TenantClass = require('./models/TenantClass');
  const Teacher = require('./models/Teacher');
  const TenantStaffProfile = require('./models/TenantStaffProfile');
  const LegacyMigrationRun = require('./models/LegacyMigrationRun');
  const AuditEvent = require('./models/AuditEvent');
  return { User, Organization, Branch, OrganizationMembership, TenantClass, Teacher, TenantStaffProfile, LegacyMigrationRun, AuditEvent };
}

async function list(Model, filter, projection, session) {
  let query = Model.find(filter).select(projection).lean();
  if (session) query = query.session(session);
  return query.exec();
}

async function loadSnapshot(manifest, models, session = null) {
  const userIds = manifest.staff.map((item) => item.legacyUserId);
  const branchIds = [...new Set([
    manifest.primaryBranchId,
    ...manifest.staff.flatMap((item) => item.branchIds),
  ])];
  const teacherIds = [...new Set(manifest.staff.map((item) => item.legacyTeacherId).filter(Boolean))];

  const loaders = [
    () => models.Organization.findOne({ _id: manifest.organizationId }).select('_id name status timezone').lean().exec(),
    () => list(models.Branch, { _id: { $in: branchIds } }, '_id organizationId name code status timezone', session),
    () => list(models.User, { _id: { $in: userIds } }, '_id username email role', session),
    () => list(models.OrganizationMembership, {
      organizationId: manifest.organizationId,
      userId: { $in: userIds },
    }, '_id organizationId userId role branchIds classNames accessAllBranches status', session),
    () => list(models.TenantClass, {
      organizationId: manifest.organizationId,
      branchId: { $in: branchIds },
      status: 'active',
    }, '_id organizationId branchId name status', session),
    () => list(models.Teacher, { _id: { $in: teacherIds } },
      '_id GR_No firstName middleName lastName Email RegisterPhoneNumber gender dob address', session),
    () => list(models.TenantStaffProfile, {
      organizationId: manifest.organizationId,
      legacySourceTeacherId: { $in: teacherIds },
    }, '_id organizationId branchId userId legacySourceTeacherId', session),
  ];

  const values = session
    ? await (async () => {
      const sequential = [];
      for (const load of loaders) sequential.push(await load());
      return sequential;
    })()
    : await Promise.all(loaders.map((load) => load()));

  return {
    organization: values[0],
    branches: values[1],
    users: values[2],
    memberships: values[3],
    tenantClasses: values[4],
    teachers: values[5],
    staffProfiles: values[6],
  };
}

async function checkRequiredCollectionsAndIndexes(models) {
  const names = new Set((await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const requiredModels = [
    models.User, models.Organization, models.Branch, models.OrganizationMembership,
    models.TenantClass, models.Teacher, models.TenantStaffProfile,
    models.LegacyMigrationRun, models.AuditEvent,
  ];
  const missing = [...new Set(requiredModels.map((model) => model.collection.name))].filter((name) => !names.has(name));
  if (missing.length) {
    const error = new Error('Required collections are missing. Start the approved SaaS schema deployment before applying staff migration.');
    error.code = 'STAFF_MIGRATION_COLLECTIONS_MISSING';
    error.details = missing;
    throw error;
  }

  async function requireUniqueIndex(Model, keys, partial = null) {
    const indexes = await Model.collection.indexes();
    const desired = JSON.stringify(keys);
    const found = indexes.some((index) => {
      if (JSON.stringify(index.key) !== desired || index.unique !== true) return false;
      if (!partial) return true;
      return Object.entries(partial).every(([field, value]) =>
        JSON.stringify((index.partialFilterExpression || {})[field]) === JSON.stringify(value)
      );
    });
    if (!found) {
      const error = new Error('Required unique index is missing on ' + Model.collection.name + ': ' + Object.keys(keys).join(', '));
      error.code = 'STAFF_MIGRATION_INDEX_MISSING';
      error.details = { collection: Model.collection.name, keys };
      throw error;
    }
  }

  await requireUniqueIndex(models.OrganizationMembership, { organizationId: 1, userId: 1 });
  await requireUniqueIndex(models.TenantStaffProfile, { organizationId: 1, branchId: 1, userId: 1 });
  await requireUniqueIndex(models.TenantStaffProfile, { organizationId: 1, branchId: 1, legacySourceTeacherId: 1 }, {
    legacySourceTeacherId: { $type: 'objectId' },
  });
  await requireUniqueIndex(models.LegacyMigrationRun, { fingerprint: 1 });
}

function requireApplyConfirmation(manifest) {
  const errors = [];
  if (process.env.NODE_ENV !== 'staging' || process.env.SAAS_MIGRATION_ENV !== 'staging') {
    errors.push({ code: 'STAGING_ENVIRONMENT_REQUIRED' });
  }
  if (process.env.ALLOW_LEGACY_STAFF_MIGRATION !== 'true') {
    errors.push({ code: 'WRITE_GATE_NOT_ENABLED' });
  }
  if (!hasFlag('--apply')) errors.push({ code: 'EXPLICIT_APPLY_FLAG_REQUIRED' });
  if (optionValue('--confirm-source-label') !== manifest.sourceSchoolLabel) {
    errors.push({ code: 'SOURCE_LABEL_CONFIRMATION_MISMATCH' });
  }
  if (String(optionValue('--confirm-organization') || '').toLowerCase() !== manifest.organizationId) {
    errors.push({ code: 'ORGANIZATION_CONFIRMATION_MISMATCH' });
  }
  if (String(optionValue('--confirm-primary-branch') || '').toLowerCase() !== manifest.primaryBranchId) {
    errors.push({ code: 'PRIMARY_BRANCH_CONFIRMATION_MISMATCH' });
  }
  if (!validObjectId(optionValue('--approved-by'))) errors.push({ code: 'APPROVED_BY_MUST_BE_OBJECT_ID' });
  const ticket = String(optionValue('--change-ticket') || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,99}$/.test(ticket)) errors.push({ code: 'CHANGE_TICKET_REQUIRED' });
  return { errors, ticket };
}

async function ensureApprover(models, manifest, approvedById, snapshot) {
  const user = snapshot.users.find((item) => id(item) === approvedById) ||
    await models.User.findById(approvedById).select('_id username email').lean();
  if (!user) return { user: null, membership: null };
  const membership = await models.OrganizationMembership.findOne({
    organizationId: manifest.organizationId,
    userId: approvedById,
    status: 'active',
    role: { $in: ['organization_owner', 'head_office_admin'] },
  }).lean();
  if (!membership) return { user, membership: null };
  if (!membership.accessAllBranches) {
    const assigned = new Set((membership.branchIds || []).map(id));
    const targetBranches = new Set([manifest.primaryBranchId, ...manifest.staff.flatMap((item) => item.branchIds)]);
    if ([...targetBranches].some((branchId) => !assigned.has(branchId))) return { user, membership: null };
  }
  return { user, membership };
}

function id(value) {
  return String(value?._id || value?.id || value || '').toLowerCase();
}

async function writePlan(models, manifest, plan, approvedBy, ticket, session) {
  const alreadyRun = await models.LegacyMigrationRun.findOne({ fingerprint: plan.fingerprint }).session(session).lean();
  if (alreadyRun) {
    const error = new Error('This staff identity mapping fingerprint was already applied.');
    error.code = 'STAFF_MIGRATION_ALREADY_APPLIED';
    throw error;
  }

  const now = new Date();
  const [run] = await models.LegacyMigrationRun.create([{
    fingerprint: plan.fingerprint,
    sourceSchoolLabel: manifest.sourceSchoolLabel,
    organizationId: manifest.organizationId,
    branchId: manifest.primaryBranchId,
    approvedBy: approvedBy._id,
    changeTicket: ticket,
    status: 'applying',
    startedAt: now,
    summary: {
      staffMembershipsCreated: plan.membershipsToCreate.length,
      staffProfilesCreated: plan.profilesToCreate.length,
      databaseOperations: plan.summary.databaseOperations,
    },
  }], { session });

  if (plan.membershipsToCreate.length) {
    await models.OrganizationMembership.insertMany(plan.membershipsToCreate, { session, ordered: true });
  }
  if (plan.profilesToCreate.length) {
    await models.TenantStaffProfile.insertMany(plan.profilesToCreate, { session, ordered: true });
  }

  await models.AuditEvent.create([{
    organizationId: manifest.organizationId,
    branchId: manifest.primaryBranchId,
    actorUserId: approvedBy._id,
    action: 'legacy.staff_migration.completed',
    resourceType: 'legacy_staff_migration',
    resourceId: plan.fingerprint,
    summary: 'Verified legacy staff accounts were scoped to the target organization and assigned branches under change ' + ticket + '.',
    reason: 'Source label: ' + manifest.sourceSchoolLabel + '; memberships were created with explicit branch and class scopes.',
    changedFields: ['organizationMemberships', 'tenantStaffProfiles'],
  }], { session });

  await models.LegacyMigrationRun.updateOne(
    { _id: run._id, status: 'applying' },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        summary: {
          staffMembershipsCreated: plan.membershipsToCreate.length,
          staffProfilesCreated: plan.profilesToCreate.length,
          databaseOperations: plan.summary.databaseOperations,
        },
      },
    },
    { session },
  );

  return { status: 'STAFF_MIGRATION_COMPLETED', fingerprint: plan.fingerprint, runId: String(run._id) };
}

async function run() {
  if (hasFlag('--help') || hasFlag('-h')) {
    console.log(USAGE);
    return;
  }

  const file = optionValue('--manifest');
  if (!file) {
    console.error('A staff mapping manifest is required. No database was connected and no writes were attempted.');
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let raw;
  try {
    raw = JSON.parse(await fs.readFile(path.resolve(process.cwd(), file), 'utf8'));
  } catch (error) {
    console.error('Could not read the staff mapping manifest: ' + (error.message || 'invalid JSON'));
    process.exitCode = 2;
    return;
  }

  const validation = validateLegacyStaffManifest(raw);
  if (!validation.valid) {
    report({
      status: 'BLOCKED_FOR_REVIEW',
      applyRequested: hasFlag('--apply'),
      writesPerformed: false,
      errors: Object.keys(validation.errors).map((field) => ({ code: 'MANIFEST_' + field.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase() })),
      message: 'Correct the manifest and obtain identity/branch confirmation. No database connection or write was attempted.',
    });
    process.exitCode = 2;
    return;
  }
  const manifest = validation.value;

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing. No database changes were attempted.');
    process.exitCode = 2;
    return;
  }

  const applyRequested = hasFlag('--apply');
  const gates = requireApplyConfirmation(manifest);
  if (applyRequested && gates.errors.length) {
    report({
      status: 'BLOCKED_FOR_REVIEW',
      applyRequested,
      writesPerformed: false,
      errors: gates.errors,
      message: 'Staff migration apply gates failed. No database connection or write was attempted.',
    });
    process.exitCode = 2;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
      autoCreate: false,
    });
    connected = true;
    const models = modelSet();

    let snapshot = await loadSnapshot(manifest, models);
    let evaluation = buildLegacyStaffMigrationPlan({
      manifest,
      ...snapshot,
      approvedBy: { _id: optionValue('--approved-by') || snapshot.organization?.createdBy || '000000000000000000000000' },
    });
    let approver = null;

    if (applyRequested) {
      const approved = await ensureApprover(models, manifest, optionValue('--approved-by'), snapshot);
      approver = approved.user;
      if (!approved.user || !approved.membership) {
        report({
          status: 'BLOCKED_FOR_REVIEW',
          applyRequested,
          writesPerformed: false,
          errors: [{ code: 'APPROVER_MUST_HAVE_ACTIVE_ORGANIZATION_ADMIN_ACCESS_TO_ALL_TARGET_BRANCHES' }],
          message: 'The approver must be an active owner or head-office administrator with access to every target branch. No data was changed.',
        });
        process.exitCode = 2;
        return;
      }
      evaluation = buildLegacyStaffMigrationPlan({ manifest, ...snapshot, approvedBy: approver });
    }

    if (!evaluation.valid || evaluation.noOp) {
      report({
        status: !evaluation.valid ? 'BLOCKED_FOR_REVIEW' : 'NO_STAFF_CHANGES_REQUIRED',
        applyRequested,
        writesPerformed: false,
        fingerprint: evaluation.fingerprint,
        summary: evaluation.summary,
        errors: evaluation.errors,
        message: !evaluation.valid
          ? 'Resolve every identity, branch, class, and existing-access conflict. No changes were made.'
          : 'Every requested membership/profile is already present with the declared scope. No changes were made.',
      });
      if (!evaluation.valid && applyRequested) process.exitCode = 2;
      return;
    }

    if (!applyRequested) {
      report({
        status: 'READY_FOR_MANUAL_REVIEW',
        applyRequested: false,
        writesPerformed: false,
        fingerprint: evaluation.fingerprint,
        summary: evaluation.summary,
        errors: [],
        message: 'Dry run only. No membership, staff profile, audit event, or migration ledger was written.',
      });
      return;
    }

    await checkRequiredCollectionsAndIndexes(models);

    let applied;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const freshSnapshot = await loadSnapshot(manifest, models, session);
        const freshApprover = await models.User.findById(optionValue('--approved-by')).select('_id username email').session(session).lean();
        const freshApproverMembership = await models.OrganizationMembership.findOne({
          organizationId: manifest.organizationId,
          userId: optionValue('--approved-by'),
          status: 'active',
          role: { $in: ['organization_owner', 'head_office_admin'] },
        }).session(session).lean();
        if (!freshApprover || !freshApproverMembership) {
          const error = new Error('The approver lost organization-level access before the transaction started.');
          error.code = 'STAFF_MIGRATION_APPROVER_ACCESS_CHANGED';
          throw error;
        }
        if (!freshApproverMembership.accessAllBranches) {
          const allowed = new Set((freshApproverMembership.branchIds || []).map(id));
          const needed = new Set([manifest.primaryBranchId, ...manifest.staff.flatMap((item) => item.branchIds)]);
          if ([...needed].some((branchId) => !allowed.has(branchId))) {
            const error = new Error('The approver no longer has access to every target branch.');
            error.code = 'STAFF_MIGRATION_APPROVER_BRANCH_ACCESS_CHANGED';
            throw error;
          }
        }

        const freshPlan = buildLegacyStaffMigrationPlan({
          manifest,
          ...freshSnapshot,
          approvedBy: freshApprover,
        });
        if (!freshPlan.valid || freshPlan.noOp || freshPlan.fingerprint !== evaluation.fingerprint) {
          const error = new Error('The source accounts, memberships, classes, or profile mappings changed after review.');
          error.code = 'STAFF_MIGRATION_SOURCE_CHANGED';
          error.details = freshPlan.errors;
          throw error;
        }
        applied = await writePlan(models, manifest, freshPlan, freshApprover, gates.ticket, session);
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, maxCommitTimeMS: 15000 });
    } finally {
      await session.endSession();
    }

    report({
      ...applied,
      applyRequested: true,
      writesPerformed: true,
      summary: evaluation.summary,
      errors: [],
      message: 'The verified staff mapping committed in one transaction. Re-run the read-only preflight, check each account’s branch/class permissions, and test sign-in before enabling access to real staff.',
    });
  } catch (error) {
    report({
      status: 'STAFF_MIGRATION_ABORTED',
      applyRequested,
      writesPerformed: false,
      errors: [{ code: error.code === 11000 ? 'DUPLICATE_OR_CONCURRENT_STAFF_MIGRATION' : error.code || 'STAFF_MIGRATION_FAILED' }],
      message: (error.message || 'The staff migration failed.') + ' Transaction changes were rolled back if apply had begun.',
    });
    process.exitCode = 2;
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

run();
