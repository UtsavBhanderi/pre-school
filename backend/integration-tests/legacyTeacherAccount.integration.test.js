'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('school administrators manually create teacher logins that can sign in with email and password immediately', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_teacher_manual_login_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const DailyWorkReport = require('../models/DailyWorkReport');
  const Teacher = require('../models/Teacher');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'School Admin ' + tag,
    email: 'admin-' + tag + '@example.test',
    password: 'TeacherAdminPassword123',
    role: 'admin',
  });
  const adminToken = jwt.sign(
    { user: { id: String(admin._id), role: 'admin', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const parent = await User.create({
    username: 'Parent Account ' + tag,
    email: 'parent-' + tag + '@example.test',
    password: 'ParentAccountPassword123',
    role: 'parent',
  });
  const parentToken = jwt.sign(
    { user: { id: String(parent._id), role: 'parent', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const teacherEmail = 'teacher-' + tag + '@example.test';
  const teacherPassword = 'TeacherInitialPassword123';
  await Teacher.create({ Email: teacherEmail, standard: 'Nursery' });

  async function api(pathname, { token, method = 'GET', body } = {}) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: {
        ...(token ? { 'x-auth-token': token } : {}),
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
      User.deleteMany({ _id: { $in: [admin._id, parent._id] } }),
      DailyWorkReport.deleteMany({ user: { $in: [admin._id, parent._id] } }),
      User.deleteMany({ email: teacherEmail }),
      Teacher.deleteMany({ Email: teacherEmail }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  await t.test('teacher birthday view returns only the fields required by the birthday screen', async () => {
    await Teacher.updateOne(
      { Email: teacherEmail },
      { $set: { firstName: 'Teacher', middleName: tag, dob: '1990-05-14', address: 'Private home address', EmergencyPhoneNumber: '09876543210', drivingLicence: 'PRIVATE-LICENCE' } },
    );
    const response = await api('/api/teachers/birthdays', { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assert.equal(response.data[0].dob, '1990-05-14');
    assert.equal(response.data[0].standard, 'Nursery');
    assert.equal(Object.prototype.hasOwnProperty.call(response.data[0], 'address'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.data[0], 'EmergencyPhoneNumber'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(response.data[0], 'drivingLicence'), false);
  });

  await t.test('teacher profile email cannot be assigned to more than one teacher', async () => {
    const response = await api('/api/teachers', {
      token: adminToken,
      method: 'POST',
      body: { firstName: 'Duplicate', Email: teacherEmail.toUpperCase(), standard: 'Nursery' },
    });
    assert.equal(response.status, 409);
    assert.match(response.data.message, /already exists/);
    assert.equal(await Teacher.countDocuments({ Email: new RegExp('^' + teacherEmail + '
    const response = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'Self Registered', email: teacherEmail, password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 401);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 0);
  });

  await t.test('administrator creates an active teacher account directly, without invitation or verification', async () => {
    const response = await api('/api/auth/register', {
      token: adminToken,
      method: 'POST',
      body: { username: 'Teacher ' + tag, email: teacherEmail.toUpperCase(), password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.user.role, 'teacher');
    assert.equal(response.data.user.status, 'active');
    assert.equal(response.data.token, undefined);
    assert.match(response.data.message, /immediately/);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 1);
  });

  let teacherToken;
  await t.test('teacher signs in immediately with email ID and password; no email verification token is needed', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: teacherPassword },
    });
    assert.equal(response.status, 200);
    assert.ok(response.data.token);
    teacherToken = response.data.token;

    const me = await api('/api/auth/me', { token: teacherToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, teacherEmail);
    assert.equal(me.data.user.role, 'teacher');
  });

  await t.test('teacher cannot create another account from the administrator-only endpoint', async () => {
    const response = await api('/api/auth/register', {
      token: teacherToken,
      method: 'POST',
      body: { username: 'Another Teacher', email: 'other-' + tag + '@example.test', password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 403);
  });

  await t.test('only administrators and teachers can use the daily work report API', async () => {
    const parentRead = await api('/api/dailyWorkReport', { token: parentToken });
    const parentCreate = await api('/api/dailyWorkReport', {
      token: parentToken,
      method: 'POST',
      body: {
        TimeIn: '09:00',
        TimeOut: '13:00',
        subject: 'Classroom',
        standard: 'Nursery',
        dailyWorkReport: 'Parent account must not create a staff work report.',
        totalStudents: 10,
      },
    });
    assert.equal(parentRead.status, 403);
    assert.equal(parentCreate.status, 403);
    assert.equal(await DailyWorkReport.countDocuments({ user: parent._id }), 0);

    const teacherCreate = await api('/api/dailyWorkReport', {
      token: teacherToken,
      method: 'POST',
      body: {
        TimeIn: '09:00',
        TimeOut: '13:00',
        subject: 'Language',
        standard: 'Nursery',
        branch: 'Main',
        dailyWorkReport: 'Read a story and practised new words.',
        totalStudents: 12,
      },
    });
    assert.equal(teacherCreate.status, 201);
    const teacherOwnReports = await api('/api/dailyWorkReport', { token: teacherToken });
    assert.equal(teacherOwnReports.status, 200);
    assert.equal(teacherOwnReports.data.length, 1);
    assert.equal(teacherOwnReports.data[0].subject, 'Language');

    const teacherAllReports = await api('/api/dailyWorkReport/all', { token: teacherToken });
    assert.equal(teacherAllReports.status, 403);
    const adminAllReports = await api('/api/dailyWorkReport/all', { token: adminToken });
    assert.equal(adminAllReports.status, 200);
    assert.equal(adminAllReports.data.length, 1);
  });

  await t.test('wrong password is still rejected', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: 'IncorrectPassword123' },
    });
    assert.equal(response.status, 401);
  });
});
, 'i') }), 1);
  });

  await t.test('teacher accounts cannot be self-registered or created without administrator access', async () => {
    const response = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'Self Registered', email: teacherEmail, password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 401);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 0);
  });

  await t.test('administrator creates an active teacher account directly, without invitation or verification', async () => {
    const response = await api('/api/auth/register', {
      token: adminToken,
      method: 'POST',
      body: { username: 'Teacher ' + tag, email: teacherEmail.toUpperCase(), password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.user.role, 'teacher');
    assert.equal(response.data.user.status, 'active');
    assert.equal(response.data.token, undefined);
    assert.match(response.data.message, /immediately/);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 1);
  });

  let teacherToken;
  await t.test('teacher signs in immediately with email ID and password; no email verification token is needed', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: teacherPassword },
    });
    assert.equal(response.status, 200);
    assert.ok(response.data.token);
    teacherToken = response.data.token;

    const me = await api('/api/auth/me', { token: teacherToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, teacherEmail);
    assert.equal(me.data.user.role, 'teacher');
  });

  await t.test('teacher cannot create another account from the administrator-only endpoint', async () => {
    const response = await api('/api/auth/register', {
      token: teacherToken,
      method: 'POST',
      body: { username: 'Another Teacher', email: 'other-' + tag + '@example.test', password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 403);
  });

  await t.test('only administrators and teachers can use the daily work report API', async () => {
    const parentRead = await api('/api/dailyWorkReport', { token: parentToken });
    const parentCreate = await api('/api/dailyWorkReport', {
      token: parentToken,
      method: 'POST',
      body: {
        TimeIn: '09:00',
        TimeOut: '13:00',
        subject: 'Classroom',
        standard: 'Nursery',
        dailyWorkReport: 'Parent account must not create a staff work report.',
        totalStudents: 10,
      },
    });
    assert.equal(parentRead.status, 403);
    assert.equal(parentCreate.status, 403);
    assert.equal(await DailyWorkReport.countDocuments({ user: parent._id }), 0);

    const teacherCreate = await api('/api/dailyWorkReport', {
      token: teacherToken,
      method: 'POST',
      body: {
        TimeIn: '09:00',
        TimeOut: '13:00',
        subject: 'Language',
        standard: 'Nursery',
        branch: 'Main',
        dailyWorkReport: 'Read a story and practised new words.',
        totalStudents: 12,
      },
    });
    assert.equal(teacherCreate.status, 201);
    const teacherOwnReports = await api('/api/dailyWorkReport', { token: teacherToken });
    assert.equal(teacherOwnReports.status, 200);
    assert.equal(teacherOwnReports.data.length, 1);
    assert.equal(teacherOwnReports.data[0].subject, 'Language');

    const teacherAllReports = await api('/api/dailyWorkReport/all', { token: teacherToken });
    assert.equal(teacherAllReports.status, 403);
    const adminAllReports = await api('/api/dailyWorkReport/all', { token: adminToken });
    assert.equal(adminAllReports.status, 200);
    assert.equal(adminAllReports.data.length, 1);
  });

  await t.test('wrong password is still rejected', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: 'IncorrectPassword123' },
    });
    assert.equal(response.status, 401);
  });
});
