'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { matchesUploadSignature } = require('../middleware/verifyUploadContent');

test('accepts supported image files only when their binary signature matches', () => {
  assert.equal(matchesUploadSignature('students', 'portrait.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(matchesUploadSignature('gallery', 'portrait.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesUploadSignature('teachers', 'portrait.webp', Buffer.from('RIFF0000WEBP')), true);
  assert.equal(matchesUploadSignature('gallery', 'portrait.gif', Buffer.from('GIF89a')), true);
  assert.equal(matchesUploadSignature('students', 'portrait.jpg', Buffer.from('<html>not an image</html>')), false);
  assert.equal(matchesUploadSignature('gallery', 'portrait.png', Buffer.from('GIF89a')), false);
});

test('accepts only PDF signature bytes for PDF resources', () => {
  assert.equal(matchesUploadSignature('pdf', 'worksheet.pdf', Buffer.from('%PDF-1.7')), true);
  assert.equal(matchesUploadSignature('pdf', 'worksheet.pdf', Buffer.from('<html>')), false);
  assert.equal(matchesUploadSignature('pdf', 'worksheet.html', Buffer.from('%PDF-1.7')), false);
});

test('accepts supported video container signatures', () => {
  const isoBmff = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]);
  assert.equal(matchesUploadSignature('video', 'lesson.mp4', isoBmff), true);
  assert.equal(matchesUploadSignature('video', 'lesson.mov', isoBmff), true);
  assert.equal(matchesUploadSignature('video', 'lesson.m4v', isoBmff), true);
  assert.equal(matchesUploadSignature('video', 'lesson.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(matchesUploadSignature('video', 'lesson.ogv', Buffer.from('OggS')), true);
  assert.equal(matchesUploadSignature('video', 'lesson.mp4', Buffer.from('not a video')), false);
});

test('rejects unsupported directories and extensions', () => {
  assert.equal(matchesUploadSignature('students', 'portrait.svg', Buffer.from('<svg/>')), false);
  assert.equal(matchesUploadSignature('unknown', 'portrait.jpg', Buffer.from([0xff, 0xd8, 0xff])), false);
});


test('accepts student document PDFs and images only when their binary signatures match', () => {
  assert.equal(matchesUploadSignature('student-documents', 'birth-certificate.pdf', Buffer.from('%PDF-1.7')), true);
  assert.equal(matchesUploadSignature('student-documents', 'identity.jpg', Buffer.from([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(matchesUploadSignature('student-documents', 'address.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesUploadSignature('student-documents', 'certificate.pdf', Buffer.from('<html>')), false);
  assert.equal(matchesUploadSignature('student-documents', 'document.exe', Buffer.from('MZ')), false);
  assert.equal(matchesUploadSignature('student-documents', 'photo.svg', Buffer.from('<svg/>')), false);
});
