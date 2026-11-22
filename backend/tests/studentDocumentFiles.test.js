'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DOCUMENT_TYPES,
  MAX_STUDENT_DOCUMENT_BYTES,
  sanitizeOriginalFileName,
  getStudentDocumentMimeType,
  normalizeStudentDocumentMetadata,
  isSafeStudentDocumentStorageName,
} = require('../utils/studentDocumentFiles');

test('student document categories and upload limits are explicit', () => {
  assert.equal(DOCUMENT_TYPES.includes('birth_certificate'), true);
  assert.equal(DOCUMENT_TYPES.includes('medical_record'), true);
  assert.equal(MAX_STUDENT_DOCUMENT_BYTES, 10 * 1024 * 1024);
});

test('original names are reduced to a safe file name without path components or control characters', () => {
  assert.equal(sanitizeOriginalFileName('../../family/birth:certificate.pdf'), 'birth_certificate.pdf');
  assert.equal(sanitizeOriginalFileName('C:\\\\private\\\\proof.png'), 'proof.png');
  assert.equal(sanitizeOriginalFileName(''), 'document');
});

test('metadata validation requires a known category and bounded title and notes', () => {
  assert.deepEqual(
    normalizeStudentDocumentMetadata({ documentType: 'birth_certificate', notes: 'Original copy' }, 'child-birth.pdf'),
    {
      documentType: 'birth_certificate',
      title: 'child-birth',
      notes: 'Original copy',
      originalFileName: 'child-birth.pdf',
    },
  );
  assert.throws(() => normalizeStudentDocumentMetadata({ documentType: 'unknown' }, 'proof.pdf'), /category/);
  assert.throws(() => normalizeStudentDocumentMetadata({ documentType: 'other', title: 'x'.repeat(101) }, 'proof.pdf'), /100 characters/);
  assert.throws(() => normalizeStudentDocumentMetadata({ documentType: 'other', notes: 'x'.repeat(501) }, 'proof.pdf'), /500 characters/);
});

test('MIME type is derived from the allowed extension, not the browser-provided MIME header', () => {
  assert.equal(getStudentDocumentMimeType('proof.PDF'), 'application/pdf');
  assert.equal(getStudentDocumentMimeType('identity.jpeg'), 'image/jpeg');
  assert.equal(getStudentDocumentMimeType('photo.png'), 'image/png');
  assert.equal(getStudentDocumentMimeType('photo.webp'), 'image/webp');
  assert.equal(getStudentDocumentMimeType('unsafe.svg'), '');
});

test('only server-generated UUID storage names with allowed extensions are accepted', () => {
  assert.equal(isSafeStudentDocumentStorageName('123e4567-e89b-42d3-a456-426614174000.pdf'), true);
  assert.equal(isSafeStudentDocumentStorageName('../outside.pdf'), false);
  assert.equal(isSafeStudentDocumentStorageName('123e4567-e89b-42d3-a456-426614174000.html'), false);
  assert.equal(isSafeStudentDocumentStorageName('123e4567-e89b-12d3-a456-426614174000.pdf'), false);
});
