'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('fee history is append-only and legacy paid balances remain intact', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_fee_history_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Fees = require('../models/Fee');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'Fee Admin ' + tag,
    email: 'fee-admin-' + tag + '@example.test',
    password: 'FeeAdminPassword123',
    role: 'admin',
  });
  const token = jwt.sign(
    { user: { id: String(admin._id), role: 'admin', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(pathname, { method = 'GET', body } = {}) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: {
        'x-auth-token': token,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  t.after(async () => {
    await Promise.allSettled([
      mongoose.connection.dropDatabase(),
      new Promise((resolve) => server.close(resolve)),
    ]);
    await mongoose.disconnect();
  });

  const paid = await Fees.create({
    studentName: 'Legacy Family ' + tag,
    standard: 'Nursery',
    batchYear: '2026-2027',
    stuNo: 'FEE-' + tag,
    totalStandardFees: 1000,
    totalFeesPaid: 100,
    totalFeesRemaining: 900,
    paymentDetails: [],
  });

  await t.test('a text-only edit cannot erase an existing paid balance', async () => {
    const response = await api('/api/fees/update/' + paid._id, {
      method: 'PUT',
      body: { studentName: 'Updated Family ' + tag },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.totalFeesPaid, 100);
    assert.deepEqual(response.data.paymentDetails, []);
  });

  await t.test('a new payment is appended while the legacy opening balance remains', async () => {
    const response = await api('/api/fees/update/' + paid._id, {
      method: 'PUT',
      body: {
        paymentDetails: [{ date: '11/21/2026', time: '10:00 AM', amount: 50 }],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.openingBalancePaid, 100);
    assert.equal(response.data.totalFeesPaid, 150);
    assert.equal(response.data.paymentDetails.length, 1);
  });

  await t.test('a recorded payment cannot be edited or removed', async () => {
    const changed = await api('/api/fees/update/' + paid._id, {
      method: 'PUT',
      body: { paymentDetails: [{ date: '11/21/2026', time: '10:00 AM', amount: 40 }] },
    });
    assert.equal(changed.status, 409);
    assert.equal(changed.data.code, 'PAYMENT_HISTORY_IMMUTABLE');

    const removed = await api('/api/fees/update/' + paid._id, {
      method: 'PUT',
      body: { paymentDetails: [] },
    });
    assert.equal(removed.status, 409);
    assert.equal(removed.data.code, 'PAYMENT_HISTORY_IMMUTABLE');

    const deleteRecord = await api('/api/fees/delete/' + paid._id, { method: 'DELETE' });
    assert.equal(deleteRecord.status, 409);
    assert.equal(deleteRecord.data.code, 'FEE_PAYMENT_HISTORY_PRESERVED');
  });

  await t.test('additional payments append and preserve all previous receipts', async () => {
    const response = await api('/api/fees/update/' + paid._id, {
      method: 'PUT',
      body: {
        paymentDetails: [
          { date: '11/21/2026', time: '10:00 AM', amount: 50 },
          { date: '11/21/2026', time: '01:00 PM', amount: 25 },
        ],
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.totalFeesPaid, 175);
    assert.equal(response.data.paymentDetails.length, 2);
    assert.equal(response.data.paymentDetails[0].amount, 50);
  });

  await t.test('an unpaid fee record can still be deleted', async () => {
    const unpaid = await Fees.create({
      studentName: 'Unpaid Family ' + tag,
      standard: 'Nursery',
      batchYear: '2026-2027',
      stuNo: 'UNPAID-' + tag,
      totalStandardFees: 1000,
      totalFeesPaid: 0,
      totalFeesRemaining: 1000,
      paymentDetails: [],
    });
    const response = await api('/api/fees/delete/' + unpaid._id, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.equal(await Fees.exists({ _id: unpaid._id }), null);
  });
});
