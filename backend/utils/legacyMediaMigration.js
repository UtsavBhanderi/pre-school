'use strict';

const crypto = require('crypto');
const path = require('path');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const COLLECTIONS = {
  students: {
    studentPhoto: { category: 'child_photo', folder: 'students', child: true, parentConsentEligible: true },
    motherPhoto: { category: 'child_photo', folder: 'students', child: true, parentConsentEligible: false },
    fatherPhoto: { category: 'child_photo', folder: 'students', child: true, parentConsentEligible: false },
  },
  teachers: {
    selfPhoto: { category: 'staff_photo', folder: 'teachers', staff: true, parentConsentEligible: false },
  },
  photos: {
    url: { category: 'gallery_image', folder: 'gallery', parentConsentEligible: false },
  },
  pdfs: {
    filePath: { category: 'learning_pdf', folder: 'pdf', parentConsentEligible: false },
  },
  videos: {
    filePath: { category: 'learning_video', folder: 'video', parentConsentEligible: false },
  },
};
const CONFIRMATIONS = [
  'sourceOwnershipVerified',
  'backupRestoredInStaging',
  'resourceOwnershipReviewed',
  'photoConsentReviewed',
];
const EXTENSION_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isObjectId(value) {
  return typeof value === 'string' && OBJECT_ID.test(value);
}

function mappingFor(sourceCollection, sourceField) {
  return COLLECTIONS[sourceCollection]?.[sourceField] || null;
}

function sourceKey(item) {
  return [
    String(item.sourceCollection || ''),
    String(item.sourceDocumentId || '').toLowerCase(),
    String(item.sourceField || ''),
  ].join(':');
}

function validateLegacyMediaManifest(manifest = {}) {
  const errors = {};
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: { manifest: 'The manifest must be a JSON object.' } };
  }
  if (manifest.version !== 1) errors.version = 'Manifest version must be 1.';
  const sourceSchoolLabel = cleanText(manifest.sourceSchoolLabel, 120);
  if (sourceSchoolLabel.length < 2) errors.sourceSchoolLabel = 'Enter the verified legacy school label.';
  const organizationId = cleanText(manifest.organizationId, 24);
  if (!isObjectId(organizationId)) errors.organizationId = 'Provide a valid target organization ID.';
  if (!Array.isArray(manifest.items) || manifest.items.length < 1 || manifest.items.length > 1000) {
    errors.items = 'List between 1 and 1000 explicit legacy media records.';
  }

  const confirmations = manifest.confirmations && typeof manifest.confirmations === 'object' && !Array.isArray(manifest.confirmations)
    ? manifest.confirmations
    : {};
  for (const name of CONFIRMATIONS) {
    if (typeof confirmations[name] !== 'boolean') {
      errors['confirmations.' + name] = 'Set ' + name + ' to true or false explicitly.';
    }
  }

  const items = Array.isArray(manifest.items) ? manifest.items : [];
  const seen = new Set();
  const normalizedItems = items.map((item, index) => {
    const itemErrors = [];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors['items.' + index] = 'Each item must be an object.';
      return null;
    }

    const sourceCollection = cleanText(item.sourceCollection, 40);
    const sourceDocumentId = cleanText(item.sourceDocumentId, 24).toLowerCase();
    const sourceField = cleanText(item.sourceField, 40);
    const branchId = cleanText(item.branchId, 24).toLowerCase();
    const mapping = mappingFor(sourceCollection, sourceField);

    if (!mapping) itemErrors.push('Unsupported source collection/field mapping.');
    if (!isObjectId(sourceDocumentId)) itemErrors.push('A valid source document ID is required.');
    if (!isObjectId(branchId)) itemErrors.push('A valid target branch ID is required.');
    if (mapping?.staff && !isObjectId(cleanText(item.staffUserId, 24).toLowerCase())) {
      itemErrors.push('A verified tenant staff user ID is required for a teacher photo.');
    }
    if (item.allowParentAccess !== undefined && typeof item.allowParentAccess !== 'boolean') {
      itemErrors.push('allowParentAccess must be true or false.');
    }
    if (item.allowParentAccess === true && !mapping?.parentConsentEligible) {
      itemErrors.push('Parent access may only be requested for the student photo field.');
    }

    const key = sourceKey({ sourceCollection, sourceDocumentId, sourceField });
    if (seen.has(key)) itemErrors.push('The same legacy record field is listed more than once.');
    seen.add(key);

    if (itemErrors.length) errors['items.' + index] = itemErrors.join(' ');

    return {
      sourceCollection,
      sourceDocumentId,
      sourceField,
      branchId,
      staffUserId: mapping?.staff ? cleanText(item.staffUserId, 24).toLowerCase() : '',
      allowParentAccess: item.allowParentAccess === true,
    };
  });

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      version: 1,
      sourceSchoolLabel,
      organizationId: organizationId.toLowerCase(),
      confirmations: Object.fromEntries(CONFIRMATIONS.map((name) => [name, confirmations[name]])),
      items: normalizedItems,
    },
  };
}

function parseLegacyUploadReference(value, expectedFolder, apiPublicUrl = '') {
  if (typeof value !== 'string' || !value.trim()) {
    return { status: 'skip', reason: 'empty_reference' };
  }

  const raw = value.trim();
  let parsed;
  try {
    const isAbsolute = /^https?:\/\//i.test(raw);
    parsed = new URL(raw, 'http://legacy.local');
    if (isAbsolute) {
      const trustedOrigin = safeOrigin(apiPublicUrl);
      if (!trustedOrigin || parsed.origin !== trustedOrigin) {
        return { status: 'skip', reason: 'external_reference' };
      }
    } else if (parsed.origin !== 'http://legacy.local') {
      return { status: 'invalid', reason: 'unsupported_reference' };
    }
  } catch {
    return { status: 'invalid', reason: 'malformed_reference' };
  }

  const match = parsed.pathname.replace(/^\/+/, '').match(/^uploads\/(students|teachers|gallery|pdf|video)\/([^/]+)$/);
  if (!match) return { status: 'invalid', reason: 'not_a_local_upload' };
  const folder = match[1];
  let filename;
  try {
    filename = decodeURIComponent(match[2]);
  } catch {
    return { status: 'invalid', reason: 'malformed_filename' };
  }

  if (folder !== expectedFolder) return { status: 'invalid', reason: 'unexpected_source_folder' };
  if (!filename || filename === '.' || filename === '..' || filename.includes('/') || filename.includes('\\')) {
    return { status: 'invalid', reason: 'unsafe_filename' };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.(?:jpe?g|png|webp|gif|pdf|mp4|webm|mov)$/i.test(filename)) {
    return { status: 'invalid', reason: 'unsupported_filename' };
  }

  return {
    status: 'local',
    folder,
    filename,
    relativePath: path.posix.join('uploads', folder, filename),
    mimeType: inferLegacyMimeType(filename),
  };
}

function safeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

function inferLegacyMimeType(filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();
  return EXTENSION_TO_MIME[extension] || '';
}

function displayNameFor(item, mimeType) {
  const extension = Object.keys(EXTENSION_TO_MIME).find((key) => EXTENSION_TO_MIME[key] === mimeType) || '';
  const shortId = String(item.sourceDocumentId || '').slice(0, 8);
  return 'Migrated ' + item.sourceCollection + ' ' + shortId + ' ' + item.sourceField + extension;
}

function createBatchId(manifestHash, changeTicket) {
  const ticket = cleanText(changeTicket, 100);
  return 'media-' + crypto.createHash('sha256')
    .update(String(manifestHash) + ':' + ticket)
    .digest('hex')
    .slice(0, 24);
}

module.exports = {
  COLLECTIONS,
  CONFIRMATIONS,
  validateLegacyMediaManifest,
  mappingFor,
  sourceKey,
  parseLegacyUploadReference,
  inferLegacyMimeType,
  displayNameFor,
  createBatchId,
};
