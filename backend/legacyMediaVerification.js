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
const Student = require('./models/Student');
const ChildGuardian = require('./models/ChildGuardian');
const TenantStaffProfile = require('./models/TenantStaffProfile');
const TenantMediaAsset = require('./models/TenantMediaAsset');
const {
  parseLegacyUploadReference,
} = require('./utils/legacyMediaMigration');
const {
  CATEGORY_RULES,
  matchesMediaSignature,
} = require('./utils/tenantMediaFiles');
const {
  validMigrationBatchId,
  validStorageName,
  expectedSourceMapping,
  resolvePrivateAssetPath,
  summarizeVerification,
} = require('./utils/legacyMediaVerification');

const UPLOAD_ROOT = path.resolve(__dirname, 'uploads');
const TENANT_MEDIA_ROOT = path.resolve(UPLOAD_ROOT, 'tenant-media');
const MAX_BATCH_LIMIT = 5000;
const DEFAULT_BATCH_LIMIT = 1000;

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

function shortId(value) {
  return String(value || '').slice(0, 8);
}

function verificationItem(asset, status, reason, extra = {}) {
  return {
    status,
    assetIdPrefix: shortId(asset?._id),
    sourceCollection: asset?.migrationSourceCollection || 'unknown',
    sourceDocumentIdPrefix: shortId(asset?.migrationSourceDocumentId),
    sourceField: asset?.migrationSourceField || '',
    category: asset?.category || 'unknown',
    assetStatus: asset?.status || 'unknown',
    reason,
    ...extra,
  };
}

function output(report) {
  console.log(JSON.stringify(report, null, 2));
}

async function hashFile(filename) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = require('fs').createReadStream(filename);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function fileHasExpectedSignature(filename, mimeType) {
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

async function resolveSourceFile(reference, expectedFolder) {
  const expectedFolderPath = path.resolve(UPLOAD_ROOT, expectedFolder);
  const sourcePath = path.resolve(UPLOAD_ROOT, reference.relativePath);
  if (!sourcePath.startsWith(expectedFolderPath + path.sep)) {
    return { ok: false, reason: 'source_path_outside_expected_folder' };
  }

  try {
    const rootReal = await fs.realpath(UPLOAD_ROOT);
    const folderReal = await fs.realpath(expectedFolderPath);
    const stat = await fs.lstat(sourcePath);
    const sourceReal = await fs.realpath(sourcePath);

    if (folderReal !== path.join(rootReal, expectedFolder)) {
      return { ok: false, reason: 'source_folder_path_is_not_canonical' };
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { ok: false, reason: 'source_is_not_a_regular_non_symlink_file' };
    }
    if (!sourceReal.startsWith(folderReal + path.sep)) {
      return { ok: false, reason: 'source_real_path_outside_expected_folder' };
    }
    return { ok: true, path: sourceReal, sizeBytes: stat.size };
  } catch {
    return { ok: false, reason: 'source_file_missing_or_unreadable' };
  }
}

async function resolveDestinationFile(asset) {
  const paths = resolvePrivateAssetPath({
    mediaRoot: TENANT_MEDIA_ROOT,
    organizationId: String(asset.organizationId),
    branchId: String(asset.branchId),
    storageName: asset.storageName,
  });
  if (!paths) return { ok: false, reason: 'unsafe_private_storage_path' };

  try {
    const rootReal = await fs.realpath(paths.root);
    const orgReal = await fs.realpath(paths.organizationRoot);
    const branchReal = await fs.realpath(paths.branchRoot);
    const stat = await fs.lstat(paths.filePath);
    const fileReal = await fs.realpath(paths.filePath);

    if (orgReal !== path.join(rootReal, String(asset.organizationId)) ||
        branchReal !== path.join(orgReal, String(asset.branchId))) {
      return { ok: false, reason: 'private_directory_is_not_canonical' };
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { ok: false, reason: 'private_asset_is_not_a_regular_non_symlink_file' };
    }
    if (!fileReal.startsWith(branchReal + path.sep)) {
      return { ok: false, reason: 'private_file_real_path_outside_branch_folder' };
    }
    return { ok: true, path: fileReal, sizeBytes: stat.size };
  } catch {
    return { ok: false, reason: 'private_asset_file_missing_or_unreadable' };
  }
}

async function verifyTargetMapping(asset, mapping) {
  if (mapping.child) {
    const child = await Student.findOne({
      _id: asset.migrationSourceDocumentId,
      organizationId: asset.organizationId,
      branchId: asset.branchId,
    }).select('_id standard').lean();
    if (!child) return { status: 'blocked', reason: 'target_child_scope_missing_or_mismatched' };
    if (String(asset.childId || '') !== String(child._id)) {
      return { status: 'blocked', reason: 'asset_child_link_does_not_match_migrated_student' };
    }
    if (String(asset.className || '') !== String(child.standard || '')) {
      return { status: 'blocked', reason: 'child_class_changed_since_media_migration_recheck_teacher_visibility' };
    }
    return { status: 'ok', reason: '' };
  }

  if (mapping.staff) {
    if (!asset.staffUserId) return { status: 'blocked', reason: 'staff_media_missing_target_user' };
    const profile = await TenantStaffProfile.findOne({
      organizationId: asset.organizationId,
      branchId: asset.branchId,
      userId: asset.staffUserId,
      legacySourceTeacherId: asset.migrationSourceDocumentId,
      status: 'active',
    }).select('_id').lean();
    if (!profile) return { status: 'blocked', reason: 'target_staff_profile_missing_or_mismatched' };
    return { status: 'ok', reason: '' };
  }

  return { status: 'ok', reason: '' };
}

async function verifyAsset(asset, apiPublicUrl) {
  if (asset.status === 'pending_migration') {
    return verificationItem(asset, 'blocked', 'asset_is_still_pending_migration');
  }

  const mapping = expectedSourceMapping(asset);
  if (!mapping) return verificationItem(asset, 'blocked', 'source_mapping_is_not_allowlisted');
  if (mapping.category !== asset.category) {
    return verificationItem(asset, 'blocked', 'asset_category_does_not_match_source_mapping');
  }
  if (!validStorageName(asset.storageName, asset.category, asset.mimeType, CATEGORY_RULES)) {
    return verificationItem(asset, 'blocked', 'private_storage_name_or_mime_type_is_invalid');
  }
  if (!/^[a-f\d]{24}$/i.test(String(asset.migrationSourceDocumentId || ''))) {
    return verificationItem(asset, 'blocked', 'source_document_reference_is_invalid');
  }

  const [organization, branch, sourceRecord] = await Promise.all([
    Organization.findOne({ _id: asset.organizationId }).select('_id status').lean(),
    Branch.findOne({ _id: asset.branchId, organizationId: asset.organizationId }).select('_id status').lean(),
    mongoose.connection.collection(asset.migrationSourceCollection).findOne({
      _id: new mongoose.Types.ObjectId(asset.migrationSourceDocumentId),
    }),
  ]);

  if (!organization) return verificationItem(asset, 'blocked', 'organization_record_missing');
  if (!branch) return verificationItem(asset, 'blocked', 'branch_does_not_belong_to_asset_organization');
  if (!sourceRecord) return verificationItem(asset, 'blocked', 'legacy_source_record_missing');
  if (organization.status !== 'active' || branch.status !== 'active') {
    return verificationItem(asset, 'warning', 'organization_or_branch_is_not_active', {
      organizationStatus: organization.status,
      branchStatus: branch.status,
    });
  }

  const reference = parseLegacyUploadReference(
    sourceRecord[asset.migrationSourceField],
    mapping.folder,
    apiPublicUrl,
  );
  if (reference.status !== 'local') {
    return verificationItem(asset, 'blocked', 'legacy_source_field_is_not_a_matching_local_file');
  }
  if (reference.mimeType !== asset.mimeType) {
    return verificationItem(asset, 'blocked', 'source_file_type_does_not_match_asset_metadata');
  }

  const [sourcePath, destinationPath, target] = await Promise.all([
    resolveSourceFile(reference, mapping.folder),
    resolveDestinationFile(asset),
    verifyTargetMapping(asset, mapping),
  ]);

  if (!sourcePath.ok) return verificationItem(asset, 'blocked', sourcePath.reason);
  if (!destinationPath.ok) return verificationItem(asset, 'blocked', destinationPath.reason);
  if (target.status !== 'ok') return verificationItem(asset, target.status, target.reason);
  if (sourcePath.sizeBytes !== asset.sizeBytes || destinationPath.sizeBytes !== asset.sizeBytes) {
    return verificationItem(asset, 'blocked', 'source_destination_and_metadata_sizes_do_not_match');
  }

  const signatureOk = await fileHasExpectedSignature(destinationPath.path, asset.mimeType);
  if (!signatureOk) return verificationItem(asset, 'blocked', 'private_file_signature_does_not_match_mime_type');

  const [sourceHash, destinationHash] = await Promise.all([
    hashFile(sourcePath.path),
    hashFile(destinationPath.path),
  ]);
  if (sourceHash !== destinationHash) {
    return verificationItem(asset, 'blocked', 'source_and_private_file_checksums_do_not_match');
  }

  if (asset.audience === 'parent_with_photo_consent') {
    if (mapping.category !== 'child_photo' || asset.migrationSourceField !== 'studentPhoto') {
      return verificationItem(asset, 'blocked', 'parent_audience_is_not_allowed_for_this_media_field');
    }
    const currentConsent = await ChildGuardian.exists({
      organizationId: asset.organizationId,
      branchId: asset.branchId,
      childId: asset.childId,
      'consent.photoUse': 'granted',
      'consent.consentRecordedAt': { $ne: null },
      'consent.consentRecordedBy': { $ne: null },
    });
    if (!currentConsent) {
      return verificationItem(asset, 'warning', 'photo_consent_is_no_longer_recorded; parent_downloads_are_denied_by_live_access_checks');
    }
  } else if (asset.audience !== 'staff_only') {
    return verificationItem(asset, 'blocked', 'asset_audience_is_not_allowlisted');
  }

  return verificationItem(asset, asset.status === 'archived' ? 'warning' : 'ok',
    asset.status === 'archived' ? 'asset_is_archived_and_not_available_for_download' : 'source_linkage_file_signature_size_and_checksum_verified',
    {
      sourceBytes: sourcePath.sizeBytes,
      destinationBytes: destinationPath.sizeBytes,
      checksumMatch: true,
      sourceCollection: asset.migrationSourceCollection,
      sourceDocumentIdPrefix: shortId(asset.migrationSourceDocumentId),
      sourceField: asset.migrationSourceField,
      category: asset.category,
      assetStatus: asset.status,
    });
}

async function main() {
  const batchId = optionValue('--batch');
  const limitText = optionValue('--limit');
  const limit = limitText === null ? DEFAULT_BATCH_LIMIT : Number.parseInt(limitText, 10);
  const databaseName = databaseNameFromUri(process.env.MONGO_URI);

  if (!validMigrationBatchId(batchId)) {
    output({ status: 'invalid_arguments', writesPerformed: false, error: 'Provide --batch media- followed by exactly 24 lowercase hexadecimal characters.' });
    process.exitCode = 2;
    return;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_LIMIT) {
    output({ status: 'invalid_arguments', writesPerformed: false, error: '--limit must be an integer between 1 and ' + MAX_BATCH_LIMIT + '.' });
    process.exitCode = 2;
    return;
  }
  if (process.env.NODE_ENV !== 'staging' || process.env.SAAS_MIGRATION_ENV !== 'staging' || !databaseName || !/staging/i.test(databaseName)) {
    output({
      status: 'environment_blocked',
      writesPerformed: false,
      error: 'Read-only verification is deliberately restricted to NODE_ENV=staging, SAAS_MIGRATION_ENV=staging and an MONGO_URI database name containing staging.',
    });
    process.exitCode = 2;
    return;
  }
  if (!process.env.MONGO_URI) {
    output({ status: 'environment_blocked', writesPerformed: false, error: 'MONGO_URI is required.' });
    process.exitCode = 2;
    return;
  }

  let connected = false;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    connected = true;

    const query = { migrationBatchId: batchId };
    const [total, assets] = await Promise.all([
      TenantMediaAsset.countDocuments(query),
      TenantMediaAsset.find(query)
        .select('+storageName')
        .sort({ _id: 1 })
        .limit(limit + 1)
        .lean(),
    ]);
    if (!total) {
      output({
        status: 'no_matching_assets',
        writesPerformed: false,
        batchId,
        summary: { checked: 0, passed: 0, warning: 0, blocked: 0 },
        items: [],
        error: 'No media assets were found for the requested batch. Verify the batch ID from the migration run output.',
      });
      process.exitCode = 2;
      return;
    }

    const truncated = total > limit;
    const selected = assets.slice(0, limit);
    const results = [];
    for (const asset of selected) {
      results.push(await verifyAsset(asset, String(process.env.API_PUBLIC_URL || '').trim()));
    }

    const summary = summarizeVerification(results);
    const outcome = {
      status: truncated ? 'partial_limit_reached' : summary.blocked ? 'verification_blocked' : 'verification_complete',
      writesPerformed: false,
      batchId,
      totalBatchAssets: total,
      truncated,
      summary,
      items: results,
      nextStep: truncated
        ? 'The report is partial. Repeat with a larger --limit (up to ' + MAX_BATCH_LIMIT + ') before considering this batch verified.'
        : summary.blocked
          ? 'Resolve each blocked item, preserve originals, then rerun this read-only verification.'
          : summary.warning
            ? 'The byte-level integrity checks passed where reported, but review archived items and changed consent before relying on this batch.'
            : 'The private media files, source links and target organization/branch references passed these checks. This report alone is not production migration approval.',
    };
    output(outcome);
    if (truncated || summary.blocked) process.exitCode = 2;
  } catch (error) {
    output({
      status: 'verification_failed',
      writesPerformed: false,
      error: String(error?.message || 'Media verification failed.').slice(0, 500),
    });
    process.exitCode = 2;
  } finally {
    if (connected) await mongoose.disconnect();
  }
}

main();
