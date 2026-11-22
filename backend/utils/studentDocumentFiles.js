'use strict';

const DOCUMENT_TYPES = Object.freeze([
  'birth_certificate',
  'address_proof',
  'transfer_certificate',
  'previous_school_record',
  'medical_record',
  'photo_identity',
  'other',
]);

const MIME_BY_EXTENSION = Object.freeze({
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
});

const MAX_STUDENT_DOCUMENT_BYTES = 10 * 1024 * 1024;
const STORED_NAME_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.(pdf|jpg|jpeg|png|webp)$/i;

function sanitizeOriginalFileName(value) {
  const leaf = String(value || 'document')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .slice(0, 180);
  return leaf || 'document';
}

function getStudentDocumentMimeType(fileName) {
  const extension = String(fileName || '').toLowerCase().slice(String(fileName || '').lastIndexOf('.'));
  return MIME_BY_EXTENSION[extension] || '';
}

function normalizeStudentDocumentMetadata(body, originalFileName) {
  const documentType = String(body?.documentType || '').trim();
  if (!DOCUMENT_TYPES.includes(documentType)) {
    throw new TypeError('Choose a valid document category.');
  }

  const safeOriginalFileName = sanitizeOriginalFileName(originalFileName);
  const defaultTitle = safeOriginalFileName.replace(/\.[^.]+$/, '').trim() || 'Student document';
  const title = String(body?.title || defaultTitle).trim();
  const notes = String(body?.notes || '').trim();

  if (!title || title.length > 100) {
    throw new TypeError('Document name must contain 1 to 100 characters.');
  }
  if (notes.length > 500) {
    throw new TypeError('Document notes must be 500 characters or fewer.');
  }

  return { documentType, title, notes, originalFileName: safeOriginalFileName };
}

function isSafeStudentDocumentStorageName(value) {
  return typeof value === 'string' && STORED_NAME_PATTERN.test(value);
}

module.exports = {
  DOCUMENT_TYPES,
  MIME_BY_EXTENSION,
  MAX_STUDENT_DOCUMENT_BYTES,
  sanitizeOriginalFileName,
  getStudentDocumentMimeType,
  normalizeStudentDocumentMetadata,
  isSafeStudentDocumentStorageName,
};
