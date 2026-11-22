'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('administrator management insights are date-scoped and exclude non-legacy records', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_admin_overview_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const Teacher = require('../models/Teacher');
  const Attendance = require('../models/Attendance');
  const Fees = require('../models/Fee');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'Overview Admin ' + tag,
    email: 'overview-admin-' + tag + '@example.test',
    password: 'OverviewAdminPassword123',
    role: 'admin',
  });
  const teacherUser = await User.create({
    username: 'Overview Teacher ' + tag,
    email: 'overview-teacher-' + tag + '@example.test',
    password: 'OverviewTeacherPassword123',
    role: 'teacher',
  });

  const adminToken = jwt.sign(
    { user: { id: String(admin._id), role: 'admin', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const teacherToken = jwt.sign(
    { user: { id: String(teacherUser._id), role: 'teacher', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(pathname, token = adminToken) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      headers: token ? { 'x-auth-token': token } : {},
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

  const activeOne = await Student.create({
    firstName: 'Active', middleName: 'Overview', lastName: tag,
    standard: 'Overview Class', stuNo: 'OV-A-' + tag,
    batchYear: '2026-2027', admissionDate: '2026-11-21',
  });
  const activeTwo = await Student.create({
    firstName: 'Active', middleName: 'Older', lastName: tag,
    standard: 'Overview Class', stuNo: 'OV-B-' + tag,
    batchYear: '2026-2027', admissionDate: '2026-09-01',
  });
  const withdrawn = await Student.create({
    firstName: 'Withdrawn', middleName: 'Overview', lastName: tag,
    standard: 'Overview Class', stuNo: 'OV-W-' + tag,
    batchYear: '2026-2027', admissionDate: '2026-11-20', status: 'withdrawn',
  });
  const teacher = await Teacher.create({
    firstName: 'Teacher', middleName: 'Overview', lastName: tag, GR_No: 'OV-T-' + tag,
  });

  await Attendance.create({
    standard: 'Overview Class',
    date: new Date('2026-11-22T00:00:00.000Z'),
    studentDetails: [
      { studentId: activeOne._id, status: 'present' },
      { studentId: activeTwo._id, status: 'absent', reason: 'Sick' },
    ],
  });

  await Fees.create({
    studentName: 'Overview Fee ' + tag,
    standard: 'Overview Class',
    batchYear: '2026-2027',
    stuNo: 'OV-FEE-' + tag,
    totalStandardFees: 1000,
    totalFeesPaid: 200,
    totalFeesRemaining: 700,
    discount: 100,
    paymentDetails: [
      { date: '11/20/2026', time: '10:00 AM', amount: 50 },
      { date: '11/22/2026', time: '11:00 AM', amount: 150 },
      { date: '10/31/2026', time: '11:00 AM', amount: 999 },
    ],
  });

  await t.test('only administrators can open the management insights endpoint', async () => {
    assert.equal((await api('/api/admin/overview?startDate=2026-11-16&endDate=2026-11-22', null)).status, 401);
    assert.equal((await api('/api/admin/overview?startDate=2026-11-16&endDate=2026-11-22', teacherToken)).status, 403);
  });

  await t.test('summary counts active students, admissions, teachers, attendance and fees accurately', async () => {
    const response = await api('/api/admin/overview?startDate=2026-11-16&endDate=2026-11-22');
    assert.equal(response.status, 200);
    assert.deepEqual(response.data.range, {
      startDate: '2026-11-16', endDate: '2026-11-22', days: 7,
    });
    assert.deepEqual(response.data.students, { active: 2, withdrawn: 1, newAdmissions: 1 });
    assert.deepEqual(response.data.teachers, { total: 1 });
    assert.deepEqual(
      { present: response.data.attendance.present, absent: response.data.attendance.absent, marked: response.data.attendance.marked },
      { present: 1, absent: 1, marked: 2 },
    );
    assert.equal(response.data.attendance.daily.length, 7);
    assert.deepEqual(response.data.attendance.selectedEndDate, {
      date: '2026-11-22', present: 1, absent: 1, marked: 2,
    });
    assert.equal(response.data.fees.collectedInRange, 200);
    assert.equal(response.data.fees.paymentsInRange, 2);
    assert.equal(response.data.fees.collectedOnEndDate, 150);
    assert.equal(response.data.fees.paidToDate, 200);
    assert.equal(response.data.fees.outstanding, 700);
    assert.equal(JSON.stringify(response.data).includes('Overview Fee'), false);
    assert.ok(await Teacher.exists({ _id: teacher._id }));
    assert.ok(await Student.exists({ _id: withdrawn._id }));
  });

  await t.test('invalid, reversed and excessive date ranges are rejected', async () => {
    const invalid = await api('/api/admin/overview?startDate=2026-02-30&endDate=2026-03-01');
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.code, 'INVALID_DATE_RANGE');

    const reversed = await api('/api/admin/overview?startDate=2026-11-22&endDate=2026-11-21');
    assert.equal(reversed.status, 400);
    assert.equal(reversed.data.code, 'REVERSED_DATE_RANGE');

    const excessive = await api('/api/admin/overview?startDate=2026-01-01&endDate=2026-04-01');
    assert.equal(excessive.status, 400);
    assert.equal(excessive.data.code, 'DATE_RANGE_TOO_LARGE');
  });
});
