'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('legacy parent direct login works without MongoDB transactions and reuses its family account', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_parent_direct_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';
  process.env.SINGLE_SCHOOL_NAME = 'Direct Family Login School';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const ParentAccount = require('../models/ParentAccount');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const parentEmail = 'family-' + tag + '@example.test';
  const mobile = '9876543210';

  async function api(pathname, body) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + pathname, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) : null };
  }

  t.after(async () => {
    await Promise.allSettled([
      mongoose.connection.dropDatabase(),
      new Promise((resolve) => server.close(resolve)),
    ]);
    await mongoose.disconnect();
  });

  const siblings = await Student.create([
    {
      stuNo: 'GR-' + tag + '-001',
      firstName: 'Aarav',
      middleName: 'Family',
      lastName: 'Child',
      standard: 'Nursery',
      parentEmail,
      FatherName: 'Family Parent',
      FatherMobileNumber: 9876543210,
    },
    {
      stuNo: 'GR-' + tag + '-002',
      firstName: 'Anaya',
      middleName: 'Family',
      lastName: 'Child',
      standard: 'Junior KG',
      parentEmail,
      FatherName: 'Family Parent',
      FatherMobileNumber: 9876543210,
    },
  ]);

  await t.test('rejects a mobile number that does not match the student record', async () => {
    const response = await api('/api/parent-access/login', {
      schoolSlug: 'direct-family-login-school',
      identifier: siblings[0].stuNo,
      phone: '9123456789',
    });
    assert.equal(response.status, 404);
    assert.equal(response.data.code, 'PARENT_RECORD_NOT_MATCHED');
    assert.equal(await ParentAccount.countDocuments({}), 0);
  });

  let firstLogin;
  await t.test('creates a session and links only the matching children', async () => {
    firstLogin = await api('/api/parent-access/login', {
      schoolSlug: 'direct-family-login-school',
      identifier: siblings[0].stuNo,
      phone: '+91 98765 43210',
    });

    assert.equal(firstLogin.status, 200);
    assert.ok(firstLogin.data.token);
    assert.equal(firstLogin.data.user.role, 'parent');

    const parent = await User.findById(firstLogin.data.user.id);
    assert.ok(parent.email.endsWith('@parent-login.invalid'));

    const account = await ParentAccount.findOne({ userId: parent._id })
      .select('+registeredPhone')
      .lean();
    assert.equal(account.registeredPhone, mobile);
    assert.equal(account.studentIds.length, 2);
    assert.deepEqual(
      account.studentIds.map(String).sort(),
      siblings.map((student) => String(student._id)).sort(),
    );
  });

  await t.test('repeat sign-in by parent email reuses the same account', async () => {
    const secondLogin = await api('/api/parent-access/login', {
      schoolSlug: 'direct-family-login-school',
      identifier: parentEmail,
      phone: mobile,
    });

    assert.equal(secondLogin.status, 200);
    assert.equal(secondLogin.data.user.id, firstLogin.data.user.id);
    assert.equal(await ParentAccount.countDocuments({}), 1);
    assert.equal(await User.countDocuments({ role: 'parent' }), 1);
  });
});
