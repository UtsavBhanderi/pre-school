'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const {
  MEDIA_TOKEN_TTL_SECONDS,
  parsePrivateMediaReference,
  signPrivateMediaToken,
  verifyPrivateMediaToken,
  rewritePrivateMediaFields,
} = require('../utils/privateMedia');

const secret = 'test-secret-that-is-not-used-outside-unit-tests';
const userId = new mongoose.Types.ObjectId().toString();

test('recognizes private image, PDF and video paths with safe extensions', () => {
  assert.deepEqual(parsePrivateMediaReference('uploads/students/child-1.jpg'), {
    type: 'students', filename: 'child-1.jpg', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('/uploads/teachers/teacher_1.webp'), {
    type: 'teachers', filename: 'teacher_1.webp', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('https://api.example.test/uploads/students/portrait.png'), {
    type: 'students', filename: 'portrait.png', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('uploads/gallery/field-trip.jpg'), {
    type: 'gallery', filename: 'field-trip.jpg', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('uploads/pdf/fee-schedule.pdf'), {
    type: 'pdf', filename: 'fee-schedule.pdf', serveable: true,
  });
  assert.deepEqual(parsePrivateMediaReference('uploads/video/class-intro.mp4'), {
    type: 'video', filename: 'class-intro.mp4', serveable: true,
  });
  assert.equal(parsePrivateMediaReference('uploads/video/danger.html').serveable, false);
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

test('expired tokens fail verification even when the signature is correct', () => {
  const expiredToken = jwt.sign(
    {
      sub: userId,
      type: 'students',
      filename: 'child-1.jpg',
      iat: Math.floor(Date.now() / 1000) - 600,
      exp: Math.floor(Date.now() / 1000) - 300,
    },
    secret,
    { issuer: 'preschool-private-media', audience: 'school-private-media', algorithm: 'HS256' },
  );
  assert.equal(verifyPrivateMediaToken(expiredToken, secret), null);
});

test('token signing refuses paths and extensions outside the allowlist', () => {
  assert.throws(() => signPrivateMediaToken({
    userId, type: 'unknown', filename: 'child.jpg', secret,
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
    resources: [
      { filePath: 'uploads/pdf/fee-schedule.pdf' },
      { url: 'uploads/video/class-intro.mp4' },
      { url: 'https://external.example.test/uploads/gallery/event.jpg' },
    ],
    gallery: { url: '/uploads/gallery/photo.png' },
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
  const pdfClaims = verifyPrivateMediaToken(new URL(rewritten.resources[0].filePath).searchParams.get('token'), secret);
  const videoClaims = verifyPrivateMediaToken(new URL(rewritten.resources[1].url).searchParams.get('token'), secret);
  const galleryClaims = verifyPrivateMediaToken(new URL(rewritten.gallery.url).searchParams.get('token'), secret);
  assert.equal(studentClaims.filename, 'child-1.jpg');
  assert.equal(motherClaims.filename, 'mother.webp');
  assert.equal(teacherClaims.type, 'teachers');
  assert.equal(pdfClaims.type, 'pdf');
  assert.equal(pdfClaims.filename, 'fee-schedule.pdf');
  assert.equal(videoClaims.type, 'video');
  assert.equal(galleryClaims.type, 'gallery');
  assert.equal(galleryClaims.filename, 'photo.png');
  assert.equal(rewritten.resources[2].url, 'https://external.example.test/uploads/gallery/event.jpg');
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
