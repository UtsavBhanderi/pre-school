'use strict';

const path = require('path');
const { mappingFor } = require('./legacyMediaMigration');

const MIGRATION_BATCH_PATTERN = /^media-[a-f0-9]{24}$/;
const STORAGE_NAME_PATTERN = /^[a-f0-9-]{36}[.](jpg|png|webp|gif|pdf|mp4|webm|mov)$/i;

function validMigrationBatchId(value) {
  return typeof value === 'string' && MIGRATION_BATCH_PATTERN.test(value);
}

function validStorageName(value, category, mimeType, categoryRules) {
  if (typeof value !== 'string' || !STORAGE_NAME_PATTERN.test(value)) return false;
  const mapping = categoryRules?.[category];
  if (!mapping || !Object.prototype.hasOwnProperty.call(mapping.mimeExtensions, mimeType)) return false;
  return value.toLowerCase().endsWith(mapping.mimeExtensions[mimeType]);
}

function expectedSourceMapping(asset) {
  if (!asset || typeof asset.migrationSourceCollection !== 'string' ||
      typeof asset.migrationSourceField !== 'string') return null;
  return mappingFor(asset.migrationSourceCollection, asset.migrationSourceField);
}

function resolvePrivateAssetPath({ mediaRoot, organizationId, branchId, storageName }) {
  if (typeof mediaRoot !== 'string' || !mediaRoot.trim()) return null;
  if (!/^[a-f0-9]{24}$/i.test(String(organizationId || '')) ||
      !/^[a-f0-9]{24}$/i.test(String(branchId || ''))) return null;
  if (typeof storageName !== 'string' || !STORAGE_NAME_PATTERN.test(storageName)) return null;

  const root = path.resolve(mediaRoot);
  const organizationRoot = path.resolve(root, String(organizationId));
  const branchRoot = path.resolve(organizationRoot, String(branchId));
  const filePath = path.resolve(branchRoot, storageName);
  if (!organizationRoot.startsWith(root + path.sep) ||
      !branchRoot.startsWith(organizationRoot + path.sep) ||
      !filePath.startsWith(branchRoot + path.sep)) return null;

  return { root, organizationRoot, branchRoot, filePath };
}

function summarizeVerification(items) {
  const summary = {
    checked: items.length,
    passed: 0,
    warning: 0,
    blocked: 0,
    byCategory: {},
    byStatus: {},
  };

  for (const item of items) {
    if (item.status === 'ok') summary.passed += 1;
    else if (item.status === 'warning') summary.warning += 1;
    else summary.blocked += 1;

    summary.byCategory[item.category] = (summary.byCategory[item.category] || 0) + 1;
    summary.byStatus[item.status] = (summary.byStatus[item.status] || 0) + 1;
  }
  return summary;
}

module.exports = {
  MIGRATION_BATCH_PATTERN,
  STORAGE_NAME_PATTERN,
  validMigrationBatchId,
  validStorageName,
  expectedSourceMapping,
  resolvePrivateAssetPath,
  summarizeVerification,
};
