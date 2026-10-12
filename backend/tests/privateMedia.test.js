'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  MEDIA_TOKEN_TTL_SECONDS,
  parsePrivateMediaReference,
  signPrivateMediaToken,
  verifyPrivateMediaToken,
  rewritePrivateMediaFields,
} = require('../utils/privateMedia');

const secret = 'test-secret-that-is-not-used-outside-unit-tests';
const userId = new mongoose.Types.ObjectId().toString();

test('recognizes only local student and teacher image paths', () => {
  assert.deepEqual(parsePrivateMediaReference('uploads/students/child-1.jpg'), {
    type: 'students', filename: 'child-1.jpg', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('/uploads/teachers/teacher_1.webp'), {
    type: 'teachers', filename: 'teacher_1.webp', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('https://api.example.test/uploads/students/portrait.png'), {
    type: 'students', filename: 'portrait.png', serveable: true,
  });
  assert.equal(parsePrivateMediaReference('uploads/gallery/field-trip.jpg'), null);
  assert.equal(parsePrivateMediaReference('uploads/students/../../.env'), null);
  assert.equal(parsePrivateMediaReference('uploads/students/a b.jpg'), null);
  assert.equal(parsePrivateMediaReference('uploads/students/picture.svg').serveable, false);
  assert.equal(parsePrivateMediaReference(''), null);
});

test('signed photo links are short lived and restricted to a specific user and file', () => {
  const token = signPrivateMediaToken({
    userId,
    type: 'students',
    filename: 'child-1.jpg',
    secret,
  });
  const claims = verifyPrivateMediaToken(token, secret);

  assert.equal(MEDIA_TOKEN_TTL_SECONDS, 120);
  assert.equal(claims.userId, userId);
  assert.equal(claims.type, 'students');
  assert.equal(claims.filename, 'child-1.jpg');
  assert.equal(verifyPrivateMediaToken(token, 'a-different-secret'), null);
  assert.equal(verifyPrivateMediaToken('not-a-token', secret), null);
});

test('token signing refuses paths and extensions outside the allowlist', () => {
  assert.throws(() => signPrivateMediaToken({
    userId, type: 'gallery', filename: 'child.jpg', secret,
  }), TypeError);
  assert.throws(() => signPrivateMediaToken({
    userId, type: 'students', filename: '../secret.jpg', secret,
  }), TypeError);
  assert.throws(() => signPrivateMediaToken({
    userId, type: 'students', filename: 'child.svg', secret,
  }), TypeError);
});

test('API payload rewriting signs nested photo fields without changing unrelated data', () => {
  const payload = {
    student: {
      studentPhoto: 'uploads/students/child-1.jpg',
      motherPhoto: '/uploads/students/mother.webp',
      fatherPhoto: 'uploads/students/vector.svg',
      name: 'Sample Child',
    },
    data: [{ selfPhoto: 'uploads/teachers/teacher.png', note: 'hello' }],
    galleryPhoto: 'uploads/gallery/event.jpg',
  };
  const rewritten = rewritePrivateMediaFields(payload, {
    userId,
    secret,
    publicBaseUrl: 'https://api.example.test/',
  });

  const studentClaims = verifyPrivateMediaToken(new URL(rewritten.student.studentPhoto).searchParams.get('token'), secret);
  const motherClaims = verifyPrivateMediaToken(new URL(rewritten.student.motherPhoto).searchParams.get('token'), secret);
  const teacherClaims = verifyPrivateMediaToken(new URL(rewritten.data[0].selfPhoto).searchParams.get('token'), secret);
  assert.equal(studentClaims.filename, 'child-1.jpg');
  assert.equal(motherClaims.filename, 'mother.webp');
  assert.equal(teacherClaims.type, 'teachers');
  assert.equal(rewritten.student.fatherPhoto, '');
  assert.equal(rewritten.student.name, 'Sample Child');
  assert.equal(rewritten.data[0].note, 'hello');
  assert.equal(rewritten.galleryPhoto, 'uploads/gallery/event.jpg');
  assert.equal(payload.student.studentPhoto, 'uploads/students/child-1.jpg', 'source object remains unchanged');
});

test('external avatar URLs and empty photo fields do not get signed or altered', () => {
  const payload = {
    studentPhoto: 'https://avatars.example.test/default.png',
    motherPhoto: '',
    fatherPhoto: null,
  };
  const rewritten = rewritePrivateMediaFields(payload, {
    userId, secret, publicBaseUrl: 'https://api.example.test',
  });
  assert.deepEqual(rewritten, payload);
});
