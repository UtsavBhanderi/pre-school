#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const Organization = require('./models/Organization');
const Branch = require('./models/Branch');
const OrganizationMembership = require('./models/OrganizationMembership');
const Student = require('./models/Student');
const ChildGuardian = require('./models/ChildGuardian');
const TenantStaffProfile = require('./models/TenantStaffProfile');
const TenantMediaAsset = require('./models/TenantMediaAsset');
const AuditEvent = require('./models/AuditEvent');
const { canAccessBranch, hasTenantRole } = require('./utils/tenantAuthorization');
const { CATEGORY_RULES, storageNameFor, safeDisplayName, matchesMediaSignature } = require('./utils/tenantMediaFiles');
const {
  mappingFor,
  validateLegacyMediaManifest,
  parseLegacyUploadReference,
  displayNameFor,
  createBatchId,
} = require('./utils/legacyMediaMigration');

const UPLOAD_ROOT = path.resolve(__dirname, 'uploads');
const TENANT_MEDIA_ROOT = path.resolve(UPLOAD_ROOT, 'tenant-media');
const APPLY_ENVIRONMENT = 'staging';
const MIGRATION_GATE = 'ALLOW_LEGACY_MEDIA_MIGRATION';

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function optionValue(option) {
  const args = process.argv.slice(2);
  const equalForm = args.find((argument) => argument.startsWith(option + '='));
  if (equalForm) return equalForm.slice(option.length + 1);
  const index = args.indexOf(option);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) return args[index + 1];
  return null;
}

function databaseNameFromUri(uri) {
  try {
    const parsed = new URL(uri);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) return '';
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, '').split('/')[0] || '');
  } catch {
    return '';
  }
}

function output(report) {
  if (hasFlag('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('LEGACY MEDIA MIGRATION PREFLIGHT');
  console.log('Mode: ' + (report.applyRequested ? 'STAGING APPLY' : 'READ-ONLY DRY RUN'));
  console.log('Writes performed: ' + (report.writesPerformed ? 'YES' : 'NO'));
  console.log('Status: ' + report.status);
  console.log('Target organization: ' + report.organizationId);
  console.log('Batch reference: ' + (report.batchId || 'dry-run'));
  console.log('Ready: ' + report.summary.ready);
  console.log('Already migrated: ' + report.summary.alreadyMigrated);
  console.log('Skipped (no local file / external URL): ' + report.summary.skipped);
  console.log('Blocked: ' + report.summary.blocked);
  for (const item of report.items) {
    console.log(
      '- ' + item.status +
      ' ' + item.sourceCollection + '/' + item.sourceDocumentIdPrefix + '.' + item.sourceField +
      ' (' + item.category + ')' +
      (item.reason ? ': ' + item.reason : '')
    );
  }
  if (report.nextStep) console.log(report.nextStep);
}

function addIssue(item, status, reason, extra = {}) {
  return {
    status,
    sourceCollection: item.sourceCollection,
    sourceDocumentIdPrefix: String(item.sourceDocumentId || '').slice(0, 8),
    sourceField: item.sourceField,
    category: mappingFor(item.sourceCollection, item.sourceField)?.category || 'unknown',
    reason,
    ...extra,
  };
}

async function safeSourceFile(relativePath, expectedFolder) {
  const expectedRoot = path.resolve(UPLOAD_ROOT, expectedFolder);
  const candidate = path.resolve(UPLOAD_ROOT, relativePath);
  if (!candidate.startsWith(expectedRoot + path.sep)) {
    return { ok: false, reason: 'resolved_path_outside_expected_folder' };
  }

  let stat;
  let realRoot;
  let realCandidate;
  try {
    stat = await fs.lstat(candidate);
    realRoot = await fs.realpath(expectedRoot);
    realCandidate = await fs.realpath(candidate);
  } catch {
    return { ok: false, reason: 'source_file_missing_or_unreadable' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return { ok: false, reason: 'source_must_be_a_regular_non_symlink_file' };
  }
  if (!realCandidate.startsWith(realRoot + path.sep)) {
    return { ok: false, reason: 'real_source_path_outside_expected_folder' };
  }
  return { ok: true, path: realCandidate, sizeBytes: stat.size };
}

async function readAndValidateSignature(filename, mimeType) {
  let handle;
  try {
    handle = await fs.open(filename, 'r');
    const header = Buffer.alloc(16);
    const result = await handle.read(header, 0, header.length, 0);
    return matchesMediaSignature(header.subarray(0, result.bytesRead), mimeType);
  } catch {
    return false;
  } finally {
    if (handle) await handle.close();
  }
}

async function loadSourceRecord(item) {
  const id = new mongoose.Types.ObjectId(item.sourceDocumentId);
  return mongoose.connection.collection(item.sourceCollection).findOne({ _id: id });
}

async function verifyTargetRecord(item, manifest, branch) {
  const mapping = mappingFor(item.sourceCollection, item.sourceField);
  if (!mapping) return { ok: false, reason: 'unsupported_source_mapping' };

  if (mapping.child) {
    const child = await Student.findOne({
      _id: item.sourceDocumentId,
      organizationId: manifest.organizationId,
      branchId: item.branchId,
    }).select('_id standard organizationId branchId').lean();
    if (!child) return { ok: false, reason: 'child_is_not_already_migrated_to_the_selected_organization_and_branch' };
    if (item.allowParentAccess) {
      const consent = await ChildGuardian.findOne({
        organizationId: manifest.organizationId,
        branchId: item.branchId,
        childId: child._id,
        'consent.photoUse': 'granted',
        'consent.consentRecordedAt': { $ne: null },
        'consent.consentRecordedBy': { $ne: null },
      }).select('_id').lean();
      if (!consent) return { ok: false, reason: 'parent_access_requested_without_a_recorded_photo_consent' };
    }
    return { ok: true, childId: child._id, className: child.standard || '', audience: item.allowParentAccess ? 'parent_with_photo_consent' : 'staff_only' };
  }

  if (mapping.staff) {
    const profile = await TenantStaffProfile.findOne({
      organizationId: manifest.organizationId,
      branchId: item.branchId,
      userId: item.staffUserId,
      legacySourceTeacherId: item.sourceDocumentId,
      status: 'active',
    }).select('_id userId').lean();
    if (!profile) return { ok: false, reason: 'teacher_photo_has_no_verified_active_tenant_staff_profile_mapping' };
    return { ok: true, staffUserId: profile.userId, className: '', audience: 'staff_only' };
  }

  return { ok: true, className: '', audience: 'staff_only' };
}

async function buildPlanItem(item, manifest, apiPublicUrl) {
  const mapping = mappingFor(item.sourceCollection, item.sourceField);
  const branch = await Branch.findOne({
    _id: item.branchId,
    organizationId: manifest.organizationId,
    status: 'active',
  }).select('_id code').lean();
  if (!branch) return addIssue(item, 'blocked', 'target_branch_not_active_in_selected_organization');

  const [sourceRecord, targetRecord] = await Promise.all([
    loadSourceRecord(item),
    verifyTargetRecord(item, manifest, branch),
  ]);
  if (!sourceRecord) return addIssue(item, 'blocked', 'legacy_source_record_not_found');
  if (!targetRecord.ok) return addIssue(item, 'blocked', targetRecord.reason);

  const storedValue = sourceRecord[item.sourceField];
  const reference = parseLegacyUploadReference(storedValue, mapping.folder, apiPublicUrl);
  if (reference.status === 'skip') return addIssue(item, 'skipped', reference.reason);
  if (reference.status !== 'local') return addIssue(item, 'blocked', reference.reason);

  const source = await safeSourceFile(reference.relativePath, mapping.folder);
  if (!source.ok) return addIssue(item, 'blocked', source.reason);
  const mimeType = reference.mimeType;
  const categoryRules = CATEGORY_RULES[mapping.category];
  if (!categoryRules || !Object.prototype.hasOwnProperty.call(categoryRules.mimeExtensions, mimeType)) {
    return addIssue(item, 'blocked', 'file_extension_not_allowed_for_media_category');
  }
  if (source.sizeBytes < 1 || source.sizeBytes > categoryRules.maxBytes || source.sizeBytes > 104857600) {
    return addIssue(item, 'blocked', 'file_size_outside_category_limit');
  }
  if (!(await readAndValidateSignature(source.path, mimeType))) {
    return addIssue(item, 'blocked', 'file_content_does_not_match_declared_file_type');
  }

  const identityFilter = {
    organizationId: manifest.organizationId,
    branchId: item.branchId,
    migrationSourceCollection: item.sourceCollection,
    migrationSourceDocumentId: item.sourceDocumentId,
    migrationSourceField: item.sourceField,
  };
  const existing = await TenantMediaAsset.findOne(identityFilter).select('+storageName').lean();
  if (existing) {
    return addIssue(item, 'already_migrated', 'migration_source_already_has_a_media_asset', {
      assetIdPrefix: String(existing._id).slice(0, 8),
      existingStatus: existing.status,
    });
  }

  return {
    status: 'ready',
    sourceCollection: item.sourceCollection,
    sourceDocumentIdPrefix: item.sourceDocumentId.slice(0, 8),
    sourceDocumentId: item.sourceDocumentId,
    sourceField: item.sourceField,
    category: mapping.category,
    branchId: item.branchId,
    sourcePath: source.path,
    sourceSizeBytes: source.sizeBytes,
    mimeType,
    childId: targetRecord.childId || null,
    staffUserId: targetRecord.staffUserId || null,
    className: targetRecord.className || '',
    audience: targetRecord.audience,
    originalFileName: safeDisplayName(displayNameFor(item, mimeType)),
    identityFilter,
  };
}

async function ensureMigrationIndex() {
  const indexes = await TenantMediaAsset.collection.indexes();
  const keys = {
    organizationId: 1,
    branchId: 1,
    migrationSourceCollection: 1,
    migrationSourceDocumentId: 1,
    migrationSourceField: 1,
  };
  const found = indexes.some((index) =>
    index.unique === true &&
    JSON.stringify(Object.entries(index.key || {})) === JSON.stringify(Object.entries(keys)) &&
    index.partialFilterExpression?.migrationSourceCollection?.$type === 'string'
  );
  if (found) return;

  await TenantMediaAsset.collection.createIndex(keys, {
    unique: true,
    partialFilterExpression: {
      migrationSourceCollection: { $type: 'string' },
      migrationSourceDocumentId: { $type: 'string' },
      migrationSourceField: { $type: 'string' },
    },
  });
}

async function copyPlanItem(planItem, manifest, approvedBy, batchId, changeTicket) {
  const mapping = mappingFor(planItem.sourceCollection, planItem.sourceField);
  const storageName = storageNameFor(planItem.category, planItem.mimeType);
  if (!storageName) throw new Error('No secure storage name could be generated for a validated file.');
  const directory = path.resolve(TENANT_MEDIA_ROOT, manifest.organizationId, planItem.branchId);
  if (!directory.startsWith(TENANT_MEDIA_ROOT + path.sep)) throw new Error('Tenant media destination escaped its storage root.');

  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const destination = path.resolve(directory, storageName);
  let copied = false;
  try {
    await fs.copyFile(planItem.sourcePath, destination, require('fs').constants.COPYFILE_EXCL);
    copied = true;
    await fs.chmod(destination, 0o640);

    let createdAsset;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const alreadyExists = await TenantMediaAsset.findOne(planItem.identityFilter).session(session).select('_id').lean();
        if (alreadyExists) {
          const duplicate = new Error('This legacy file field has already been migrated.');
          duplicate.code = 'ALREADY_MIGRATED';
          throw duplicate;
        }

        const [asset] = await TenantMediaAsset.create([{
          organizationId: manifest.organizationId,
          branchId: planItem.branchId,
          category: planItem.category,
          childId: planItem.childId,
          className: planItem.className,
          staffUserId: planItem.staffUserId,
          storageName,
          mimeType: planItem.mimeType,
          sizeBytes: planItem.sourceSizeBytes,
          originalFileName: planItem.originalFileName,
          status: 'active',
          audience: planItem.audience,
          uploadedBy: approvedBy,
          migrationSourceCollection: planItem.sourceCollection,
          migrationSourceDocumentId: planItem.sourceDocumentId,
          migrationSourceField: planItem.sourceField,
          migrationBatchId: batchId,
        }], { session });

        await AuditEvent.create([{
          organizationId: manifest.organizationId,
          branchId: planItem.branchId,
          actorUserId: approvedBy,
          action: 'legacy.media.migrated',
          resourceType: 'tenant_media_asset',
          resourceId: String(asset._id),
          outcome: 'success',
          summary: 'Legacy media copied into private organization storage.',
          reason: 'Approved staging media migration ticket ' + changeTicket + '.',
          changedFields: ['category', 'privateStorage', 'audience'],
          userAgent: 'legacy-media-migration-cli',
        }], { session });
        createdAsset = asset;
      });
    } finally {
      await session.endSession();
    }

    return {
      status: createdAsset ? 'migrated' : 'already_migrated',
      assetIdPrefix: createdAsset ? String(createdAsset._id).slice(0, 8) : '',
      storageName,
      category: mapping.category,
    };
  } catch (error) {
    if (copied) await fs.unlink(destination).catch(() => {});
    if (error.code === 'ALREADY_MIGRATED' || error.code === 11000) {
      return { status: 'already_migrated', category: mapping.category, reason: 'another process migrated this source field' };
    }
    throw error;
  }
}

async function run() {
  const applyRequested = hasFlag('--apply');
  const manifestPathValue = optionValue('--manifest');
  const manifestPath = manifestPathValue
    ? path.resolve(process.cwd(), manifestPathValue)
    : path.resolve(__dirname, '../docs/legacy-media-manifest.example.json');
  if (!manifestPathValue) {
    console.error('A reviewed copy of the media migration manifest is required; do not apply the example manifest.');
    console.error('Usage: npm run migration:media -- --manifest ./legacy-media-manifest.json');
    process.exitCode = 2;
    return;
  }

  let parsedManifest;
  try {
    parsedManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch {
    console.error('The specified media migration manifest could not be read as valid JSON.');
    process.exitCode = 2;
    return;
  }
  const validation = validateLegacyMediaManifest(parsedManifest);
  if (!validation.valid) {
    output({
      status: 'invalid_manifest',
      applyRequested,
      writesPerformed: false,
      organizationId: cleanText(parsedManifest?.organizationId, 24) || 'not provided',
      summary: { ready: 0, alreadyMigrated: 0, skipped: 0, blocked: Object.keys(validation.errors).length },
      items: Object.entries(validation.errors).map(([key, reason]) => ({
        status: 'blocked', sourceCollection: key, sourceDocumentIdPrefix: '', sourceField: '', category: 'unknown', reason,
      })),
      nextStep: 'Correct the manifest locally, review the source ownership, and run the dry run again.',
    });
    process.exitCode = 2;
    return;
  }
  const manifest = validation.value;

  if (applyRequested) {
    const databaseName = databaseNameFromUri(process.env.MONGO_URI);
    const approvedBy = optionValue('--approved-by');
    const changeTicket = optionValue('--change-ticket');
    const confirmationErrors = [];
    if (process.env.NODE_ENV !== APPLY_ENVIRONMENT) confirmationErrors.push('NODE_ENV must be exactly staging');
    if (process.env.SAAS_MIGRATION_ENV !== APPLY_ENVIRONMENT) confirmationErrors.push('SAAS_MIGRATION_ENV must be exactly staging');
    if (process.env[MIGRATION_GATE] !== 'true') confirmationErrors.push(MIGRATION_GATE + ' must be true');
    if (!databaseName || !/staging/i.test(databaseName)) confirmationErrors.push('MONGO_URI must target a database whose name explicitly contains staging');
    if (optionValue('--confirm-source-label') !== manifest.sourceSchoolLabel) confirmationErrors.push('--confirm-source-label must exactly match the manifest label');
    if (optionValue('--confirm-organization') !== manifest.organizationId) confirmationErrors.push('--confirm-organization must exactly match the manifest organization');
    if (!/^[a-f\d]{24}$/i.test(String(approvedBy || ''))) confirmationErrors.push('--approved-by must be a valid organization owner/head-office user ID');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/.test(String(changeTicket || ''))) confirmationErrors.push('--change-ticket must be a non-sensitive approved change reference');
    for (const confirmation of Object.keys(manifest.confirmations)) {
      if (manifest.confirmations[confirmation] !== true) confirmationErrors.push('Manifest confirmation ' + confirmation + ' must be true for apply');
    }
    if (confirmationErrors.length) {
      output({
        status: 'apply_blocked',
        applyRequested: true,
        writesPerformed: false,
        organizationId: manifest.organizationId,
        summary: { ready: 0, alreadyMigrated: 0, skipped: 0, blocked: confirmationErrors.length },
        items: confirmationErrors.map((reason) => ({ status: 'blocked', sourceCollection: 'release_gate', sourceDocumentIdPrefix: '', sourceField: '', category: 'unknown', reason })),
        nextStep: 'No files or database records were changed. Satisfy every staging gate and run the dry run again.',
      });
      process.exitCode = 2;
      return;
    }
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is required to check target ownership and source records.');
    process.exitCode = 2;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    connected = true;

    const organization = await Organization.findOne({
      _id: manifest.organizationId,
      status: 'active',
    }).select('_id name').lean();
    if (!organization) throw new Error('Target organization does not exist or is not active.');

    const branchIds = [...new Set(manifest.items.map((item) => item.branchId))];
    const branches = await Branch.find({
      _id: { $in: branchIds },
      organizationId: manifest.organizationId,
      status: 'active',
    }).select('_id code').lean();
    if (branches.length !== branchIds.length) throw new Error('One or more target branches do not belong to this active organization.');

    if (applyRequested) {
      const approvedBy = optionValue('--approved-by');
      const approverMemberships = await OrganizationMembership.find({
        organizationId: manifest.organizationId,
        userId: approvedBy,
        status: 'active',
        role: { $in: ['organization_owner', 'head_office_admin'] },
      }).lean();
      if (!approverMemberships.some((membership) =>
        branchIds.every((branchId) => canAccessBranch(membership, branchId))
      )) {
        throw new Error('The approver must be an active owner/head-office administrator with access to every target branch.');
      }
      await ensureMigrationIndex();
    }

    const items = [];
    for (const item of manifest.items) {
      const planned = await buildPlanItem(item, manifest, process.env.API_PUBLIC_URL || '');
      items.push(planned);
    }

    const summary = {
      ready: items.filter((item) => item.status === 'ready').length,
      alreadyMigrated: items.filter((item) => item.status === 'already_migrated').length,
      skipped: items.filter((item) => item.status === 'skipped').length,
      blocked: items.filter((item) => item.status === 'blocked').length,
    };
    const batchId = createBatchId(crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), optionValue('--change-ticket') || 'dry-run');
    if (summary.blocked) {
      output({
        status: 'blocked',
        applyRequested,
        writesPerformed: false,
        organizationId: manifest.organizationId,
        batchId,
        summary,
        items: items.map((item) => ({
          status: item.status,
          sourceCollection: item.sourceCollection,
          sourceDocumentIdPrefix: item.sourceDocumentIdPrefix,
          sourceField: item.sourceField,
          category: item.category,
          reason: item.reason || '',
          assetIdPrefix: item.assetIdPrefix || '',
          existingStatus: item.existingStatus || '',
        })),
        nextStep: 'No assets were copied. Fix every blocked item and rerun the dry run.',
      });
      process.exitCode = 2;
      return;
    }

    if (!applyRequested) {
      output({
        status: 'dry_run_complete',
        applyRequested: false,
        writesPerformed: false,
        organizationId: manifest.organizationId,
        batchId,
        summary,
        items: items.map((item) => ({
          status: item.status,
          sourceCollection: item.sourceCollection,
          sourceDocumentIdPrefix: item.sourceDocumentIdPrefix,
          sourceField: item.sourceField,
          category: item.category,
          reason: item.reason || '',
          assetIdPrefix: item.assetIdPrefix || '',
          existingStatus: item.existingStatus || '',
        })),
        nextStep: 'Review every item and source-owned record. Apply is supported only against a restored staging database.',
      });
      return;
    }

    let migrated = 0;
    let alreadyMigrated = summary.alreadyMigrated;
    const outcomes = [];
    for (const item of items) {
      if (item.status !== 'ready') {
        outcomes.push(item);
        continue;
      }
      const result = await copyPlanItem(
        item,
        manifest,
        optionValue('--approved-by'),
        batchId,
        optionValue('--change-ticket'),
      );
      if (result.status === 'migrated') migrated += 1;
      if (result.status === 'already_migrated') alreadyMigrated += 1;
      outcomes.push({
        status: result.status,
        sourceCollection: item.sourceCollection,
        sourceDocumentIdPrefix: item.sourceDocumentIdPrefix,
        sourceField: item.sourceField,
        category: item.category,
        assetIdPrefix: result.assetIdPrefix || '',
        reason: result.reason || '',
      });
    }

    output({
      status: 'staging_apply_complete',
      applyRequested: true,
      writesPerformed: migrated > 0,
      organizationId: manifest.organizationId,
      batchId,
      summary: { migrated, alreadyMigrated, skipped: summary.skipped, blocked: 0 },
      items: outcomes.map((item) => ({
        status: item.status,
        sourceCollection: item.sourceCollection,
        sourceDocumentIdPrefix: item.sourceDocumentIdPrefix,
        sourceField: item.sourceField,
        category: item.category,
        reason: item.reason || '',
        assetIdPrefix: item.assetIdPrefix || '',
      })),
      nextStep: 'Verify every asset through the authenticated tenant media API, review parent photo consent, compare counts, and repeat the rehearsal from a fresh staging restore before production approval.',
    });
    if (outcomes.some((item) => item.status === 'blocked')) process.exitCode = 2;
  } catch (error) {
    console.error('Legacy media migration stopped safely: ' + (error.message || 'unknown error'));
    process.exitCode = 2;
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

async function buildPlanItem(item, manifest, apiPublicUrl) {
  const mapping = mappingFor(item.sourceCollection, item.sourceField);
  const branch = await Branch.findOne({
    _id: item.branchId,
    organizationId: manifest.organizationId,
    status: 'active',
  }).select('_id code').lean();
  if (!branch) return blocked(item, mapping, 'target_branch_not_active_in_selected_organization');

  const sourceRecord = await loadSourceRecord(item);
  if (!sourceRecord) return blocked(item, mapping, 'legacy_source_record_not_found');
  const target = await verifyTargetRecord(item, manifest, mapping);
  if (!target.ok) return blocked(item, mapping, target.reason);

  const reference = parseLegacyUploadReference(sourceRecord[item.sourceField], mapping.folder, apiPublicUrl);
  if (reference.status === 'skip') return addIssue(item, 'skipped', mapping, reference.reason);
  if (reference.status !== 'local') return blocked(item, mapping, reference.reason);

  const source = await safeSourceFile(reference.relativePath, mapping.folder);
  if (!source.ok) return blocked(item, mapping, source.reason);
  const categoryRules = CATEGORY_RULES[mapping.category];
  if (!categoryRules || !Object.prototype.hasOwnProperty.call(categoryRules.mimeExtensions, reference.mimeType)) {
    return blocked(item, mapping, 'file_extension_not_allowed_for_media_category');
  }
  if (source.sizeBytes < 1 || source.sizeBytes > categoryRules.maxBytes || source.sizeBytes > 104857600) {
    return blocked(item, mapping, 'file_size_outside_category_limit');
  }
  if (!(await readAndValidateSignature(source.path, reference.mimeType))) {
    return blocked(item, mapping, 'file_content_does_not_match_declared_file_type');
  }

  const identityFilter = {
    organizationId: manifest.organizationId,
    branchId: item.branchId,
    migrationSourceCollection: item.sourceCollection,
    migrationSourceDocumentId: item.sourceDocumentId,
    migrationSourceField: item.sourceField,
  };
  const existing = await TenantMediaAsset.findOne(identityFilter).select('+storageName').lean();
  if (existing) {
    const existingPath = path.resolve(TENANT_MEDIA_ROOT, manifest.organizationId, item.branchId, existing.storageName || '');
    const withinRoot = existingPath.startsWith(path.resolve(TENANT_MEDIA_ROOT, manifest.organizationId, item.branchId) + path.sep);
    return addIssue(item, 'already_migrated', mapping, withinRoot ? 'migration_source_already_has_a_media_asset' : 'existing_asset_path_invalid', {
      assetIdPrefix: String(existing._id).slice(0, 8),
      existingStatus: existing.status,
    });
  }

  return {
    status: 'ready',
    sourceCollection: item.sourceCollection,
    sourceDocumentIdPrefix: item.sourceDocumentId.slice(0, 8),
    sourceDocumentId: item.sourceDocumentId,
    sourceField: item.sourceField,
    category: mapping.category,
    branchId: item.branchId,
    sourcePath: source.path,
    sourceSizeBytes: source.sizeBytes,
    mimeType: reference.mimeType,
    childId: target.childId || null,
    staffUserId: target.staffUserId || null,
    className: target.className || '',
    audience: target.audience,
    originalFileName: safeDisplayName(displayNameFor(item, reference.mimeType)),
    identityFilter,
  };
}

function addIssue(item, status, mapping, reason, extra = {}) {
  return {
    status,
    sourceCollection: item.sourceCollection,
    sourceDocumentIdPrefix: String(item.sourceDocumentId || '').slice(0, 8),
    sourceField: item.sourceField,
    category: mapping?.category || 'unknown',
    reason,
    ...extra,
  };
}

function blocked(item, mapping, reason) {
  return addIssue(item, 'blocked', mapping, reason);
}

async function loadSourceRecord(item) {
  return mongoose.connection.collection(item.sourceCollection).findOne({
    _id: new mongoose.Types.ObjectId(item.sourceDocumentId),
  });
}

async function verifyTargetRecord(item, manifest, mapping) {
  if (mapping.child) {
    const child = await Student.findOne({
      _id: item.sourceDocumentId,
      organizationId: manifest.organizationId,
      branchId: item.branchId,
    }).select('_id standard').lean();
    if (!child) return { ok: false, reason: 'child_is_not_already_migrated_to_the_selected_organization_and_branch' };

    let audience = 'staff_only';
    if (item.allowParentAccess) {
      const consent = await ChildGuardian.findOne({
        organizationId: manifest.organizationId,
        branchId: item.branchId,
        childId: child._id,
        'consent.photoUse': 'granted',
        'consent.consentRecordedAt': { $ne: null },
        'consent.consentRecordedBy': { $ne: null },
      }).select('_id').lean();
      if (!consent) return { ok: false, reason: 'parent_access_requested_without_a_recorded_photo_consent' };
      audience = 'parent_with_photo_consent';
    }
    return { ok: true, childId: child._id, className: child.standard || '', audience };
  }

  if (mapping.staff) {
    const profile = await TenantStaffProfile.findOne({
      organizationId: manifest.organizationId,
      branchId: item.branchId,
      userId: item.staffUserId,
      legacySourceTeacherId: item.sourceDocumentId,
      status: 'active',
    }).select('_id userId').lean();
    if (!profile) return { ok: false, reason: 'teacher_photo_has_no_verified_active_tenant_staff_profile_mapping' };
    return { ok: true, staffUserId: profile.userId, className: '', audience: 'staff_only' };
  }

  return { ok: true, className: '', audience: 'staff_only' };
}

run();
