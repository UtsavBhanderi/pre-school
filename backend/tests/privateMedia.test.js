'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.PRIVATE_MEDIA_SECRET = 'test-private-media-secret';
const {
  safeFilename,
  signPrivateMediaUrl,
  verifyPrivateMediaSignature,
  transformPhotoValues,
} = require('../utils/privateMedia');

test('only safe raster photo names can be signed', () => {
  assert.equal(safeFilename('171234-photo.jpg'), true);
  assert.equal(safeFilename('parent.png'), true);
  assert.equal(safeFilename('script.svg'), false);
  assert.equal(safeFilename('../photo.jpg'), false);
  assert.equal(safeFilename('folder/photo.jpg'), false);
  assert.equal(safeFilename('photo.jpg\n'), false);
});

test('private media URLs are short-lived and cryptographically verified', () => {
  const now = 1791800000;
  const url = signPrivateMediaUrl('students', 'child.jpg', now, 600);
  assert.match(url, /^uploads\/students\/child\.jpg\?expires=\d{10}&signature=[a-f0-9]{64}$/);
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(verifyPrivateMediaSignature('students', 'child.jpg', params.get('expires'), params.get('signature'), now), true);
  assert.equal(verifyPrivateMediaSignature('teachers', 'child.jpg', params.get('expires'), params.get('signature'), now), false);
  assert.equal(verifyPrivateMediaSignature('students', 'other.jpg', params.get('expires'), params.get('signature'), now), false);
  assert.equal(verifyPrivateMediaSignature('students', 'child.jpg', params.get('expires'), params.get('signature'), now + 601), false);
});

test('legacy photo fields are rewritten without exposing public upload paths', () => {
  const result = transformPhotoValues({
    studentPhoto: 'uploads/students/child.jpg',
    motherPhoto: 'uploads/students/mother.png',
    fatherPhoto: '',
    unrelatedPhoto: 'uploads/gallery/event.jpg',
  }, 'https://school.example', 'students');
  assert.match(result.studentPhoto, /^uploads\/students\/child\.jpg\?expires=/);
  assert.match(result.motherPhoto, /^uploads\/students\/mother\.png\?expires=/);
  assert.equal(result.fatherPhoto, '');
  assert.equal(result.unrelatedPhoto, 'uploads/gallery/event.jpg');
});

test('teacher photo fields use the private teachers folder', () => {
  const result = transformPhotoValues({
    selfPhoto: 'uploads/teachers/teacher.jpeg',
    motherPhoto: 'uploads/teachers/guardian.jpg',
    fatherPhoto: 'father.jpg',
  }, 'https://school.example', 'teachers');
  assert.match(result.selfPhoto, /^uploads\/teachers\/teacher\.jpeg\?expires=/);
  assert.match(result.motherPhoto, /^uploads\/teachers\/guardian\.jpg\?expires=/);
  assert.match(result.fatherPhoto, /^uploads\/teachers\/father\.jpg\?expires=/);
});

test('external hosted images stay unchanged', () => {
  const external = 'https://images.example/photo.jpg';
  assert.equal(transformPhotoValues({ studentPhoto: external }, 'https://school.example', 'students').studentPhoto, external);
});
