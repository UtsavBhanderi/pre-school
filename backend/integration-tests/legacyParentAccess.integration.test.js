'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('single-school parents can self-activate and only see their linked children', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_parent_legacy_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';
  process.env.SINGLE_SCHOOL_NAME = 'Family Access School';
  process.env.FRONTEND_URL = 'https://family-school.example.test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const ParentAccount = require('../models/ParentAccount');
  const Attendance = require('../models/Attendance');
  const Fees = require('../models/Fee');
  const Announcement = require('../models/Announcement');
  const Calendar = require('../models/Calendar');
  const ReportCard = require('../models/ReportCard');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const createdUserIds = [];
  const createdStudentIds = [];
  const createdReportIds = [];
  const createdAnnouncementIds = [];
  const createdCalendarIds = [];

  async function api(pathname, { token, method = 'GET', body, params } = {}) {
    const url = new URL(pathname, 'http://127.0.0.1:' + server.address().port);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value);
    const response = await fetch(url, {
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
      ParentAccount.deleteMany({}),
      Attendance.deleteMany({ 'studentDetails.studentId': { $in: createdStudentIds } }),
      Fees.deleteMany({ stuNo: { $in: createdStudentIds.map((id) => String(id)) } }),
      ReportCard.deleteMany({ _id: { $in: createdReportIds } }),
      Announcement.deleteMany({ _id: { $in: createdAnnouncementIds } }),
      Calendar.deleteMany({ _id: { $in: createdCalendarIds } }),
      Student.deleteMany({ _id: { $in: createdStudentIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  const admin = await User.create({
    username: 'School Admin ' + tag,
    email: 'admin-' + tag + '@example.test',
    password: 'admin-test-password-123',
    role: 'admin',
  });
  createdUserIds.push(admin._id);
  const adminToken = jwt.sign(
    { user: { id: String(admin._id), role: admin.role, authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  const parentEmail = 'family-' + tag + '@example.test';
  const phone = '9876543210';
  const students = await Student.create([
    {
      stuNo: 'GR-' + tag + '-001', firstName: 'Aarav', middleName: 'Family',
      lastName: 'Child', standard: 'Nursery', batchYear: '2026-2027',
      parentEmail, FatherName: 'Family Parent', FatherMobileNumber: 9876543210,
    },
    {
      stuNo: 'GR-' + tag + '-002', firstName: 'Anaya', middleName: 'Family',
      lastName: 'Child', standard: 'Junior KG', batchYear: '2026-2027',
      parentEmail, FatherName: 'Family Parent', FatherMobileNumber: 9876543210,
    },
    {
      stuNo: 'GR-' + tag + '-003', firstName: 'Other', middleName: 'Family',
      lastName: 'Child', standard: 'Nursery',
      parentEmail: 'other-' + tag + '@example.test',
      FatherName: 'Other Parent', FatherMobileNumber: 9123456789,
    },
  ]);
  createdStudentIds.push(...students.map((student) => student._id));

  await t.test('school generates one stable, school-branded parent access URL', async () => {
    const config = await api('/api/parent-access/config');
    assert.equal(config.status, 200);
    assert.equal(config.data.mode, 'legacy_single_school');
    assert.equal(config.data.school.name, 'Family Access School');
    assert.equal(config.data.parentAccessUrl, 'https://family-school.example.test/parent-access/family-access-school');
  });

  await t.test('GR number without its registered phone cannot activate an account', async () => {
    const response = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[0].stuNo,
        phone: '9123456789',
        fullName: 'Family Parent',
        email: parentEmail,
        password: 'StrongFamilyPassword123',
      },
    });
    assert.equal(response.status, 404);
    assert.equal(response.data.code, 'PARENT_RECORD_NOT_MATCHED');
    assert.equal(await User.countDocuments({ email: parentEmail }), 0);
  });

  let activation;
  await t.test('valid GR number plus registered mobile creates a parent login and auto-links siblings', async () => {
    activation = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[0].stuNo,
        phone: '+91 98765 43210',
        fullName: 'Family Parent',
        email: parentEmail,
        password: 'StrongFamilyPassword123',
        confirmPassword: 'StrongFamilyPassword123',
      },
    });
    assert.equal(activation.status, 201);
    assert.ok(activation.data.token);
    assert.equal(activation.data.user.role, 'parent');

    const user = await User.findById(activation.data.user.id);
    createdUserIds.push(user._id);
    const parentAccount = await ParentAccount.findOne({ userId: user._id }).select('+registeredPhone').lean();
    assert.ok(parentAccount);
    assert.equal(parentAccount.registeredPhone, phone);
    assert.equal(parentAccount.studentIds.length, 2);
  });

  let parentToken;
  await t.test('parent can sign in normally and auth context identifies the parent account', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: parentEmail, password: 'StrongFamilyPassword123' },
    });
    assert.equal(login.status, 200);
    parentToken = login.data.token;

    const me = await api('/api/auth/me', { token: parentToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.parentAccount.mode, 'legacy_single_school');
    assert.equal(me.data.user.parentAccount.studentCount, 2);
  });

  await t.test('parent portal only returns the two linked children and their school data', async () => {
    const children = await api('/api/parent-portal/children', { token: parentToken });
    assert.equal(children.status, 200);
    assert.equal(children.data.total, 2);
    assert.ok(children.data.children.every((child) => child.admissionNumber !== students[2].stuNo));

    const today = new Date();
    const day = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    await Attendance.create({
      organizationId: null,
      date: day,
      standard: 'Nursery',
      studentDetails: [
        { studentId: students[0]._id, status: 'present' },
        { studentId: students[1]._id, status: 'absent', reason: 'Fever' },
      ],
    });
    const attendance = await api('/api/parent-portal/attendance', {
      token: parentToken,
      params: { from: day.toISOString().slice(0, 10), to: day.toISOString().slice(0, 10) },
    });
    assert.equal(attendance.status, 200);
    assert.equal(attendance.data.children.length, 2);

    await Fees.findOneAndUpdate({ stuNo: students[0].stuNo }, {
      $set: {
        studentName: 'Aarav Family Child',
        totalStandardFees: 12000,
        totalFeesPaid: 5000,
        totalFeesRemaining: 7000,
        paymentDetails: [{ date: day.toISOString().slice(0, 10), amount: 5000 }],
      },
    }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const fees = await api('/api/parent-portal/fees', { token: parentToken });
    assert.equal(fees.status, 200);
    assert.equal(fees.data.fees.length, 2);
    const firstChildFees = fees.data.fees.find((fee) => fee.child.admissionNumber === students[0].stuNo);
    assert.equal(firstChildFees.outstanding, 7000);

    const announcement = await Announcement.create({
      title: 'Welcome families ' + tag,
      message: 'School opens at 8:30 AM.',
      audience: 'all',
      priority: 'normal',
      createdBy: admin._id,
    });
    createdAnnouncementIds.push(announcement._id);
    const notices = await api('/api/parent-portal/notices', { token: parentToken });
    assert.equal(notices.status, 200);
    assert.ok(notices.data.notices.some((notice) => notice.title === announcement.title));

    const event = await Calendar.create({
      title: 'Family day ' + tag,
      start: new Date(Date.now() + 86400000),
      end: new Date(Date.now() + 86400000),
      color: '#4567aa',
    });
    createdCalendarIds.push(event._id);
    const calendar = await api('/api/parent-portal/calendar', {
      token: parentToken,
      params: {
        from: new Date().toISOString().slice(0, 10),
        to: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      },
    });
    assert.equal(calendar.status, 200);
    assert.ok(calendar.data.events.some((item) => item.title === event.title));

    const report = await ReportCard.create({
      reportName: 'Term one ' + tag,
      standard: 'Nursery',
      description: 'Term one learning progress.',
      students: [students[0]._id, students[2]._id],
    });
    createdReportIds.push(report._id);
    await Student.updateOne({ _id: students[0]._id }, {
      $push: {
        marks: {
          reportId: report._id,
          subjectData: [{ subject: 'Language', mark: 18, date: day.toISOString().slice(0, 10) }],
          total: 18,
          percentage: 90,
          grade: 'A',
        },
      },
    });
    const reports = await api('/api/parent-portal/reports', { token: parentToken });
    assert.equal(reports.status, 200);
    const ownReport = reports.data.reports.find((item) => item.id === String(report._id));
    assert.ok(ownReport);
    assert.equal(ownReport.children.length, 1);
    assert.equal(ownReport.children[0].admissionNumber, students[0].stuNo);
    assert.equal(ownReport.children[0].result.percentage, 90);
    assert.equal(ownReport.children[0].result.subjects[0].subject, 'Language');
  });

  await t.test('parent can change password and prior sessions are revoked', async () => {
    const changed = await api('/api/parent-portal/change-password', {
      token: parentToken,
      method: 'POST',
      body: {
        currentPassword: 'StrongFamilyPassword123',
        newPassword: 'AnotherStrongFamilyPassword456',
      },
    });
    assert.equal(changed.status, 200);
    const stale = await api('/api/auth/me', { token: parentToken });
    assert.equal(stale.status, 401);
    const nextLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { email: parentEmail, password: 'AnotherStrongFamilyPassword456' },
    });
    assert.equal(nextLogin.status, 200);

    const parentUser = await User.findOne({ email: parentEmail });
    assert.ok(parentUser);
    const suspended = await api('/api/userDetailsself/' + parentUser._id, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'suspended', role: 'parent', reason: 'Parent account requested suspension' },
    });
    assert.equal(suspended.status, 200);
    assert.equal(suspended.data.user.status, 'suspended');
    const suspendedParentAccount = await ParentAccount.findOne({ userId: parentUser._id }).lean();
    assert.equal(suspendedParentAccount.status, 'suspended');
    assert.equal((await api('/api/auth/me', { token: nextLogin.data.token })).status, 401);
    assert.equal((await api('/api/auth/login', {
      method: 'POST',
      body: { email: parentEmail, password: 'AnotherStrongFamilyPassword456' },
    })).status, 403);

    const restored = await api('/api/userDetailsself/' + parentUser._id, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'active', role: 'parent', reason: 'Parent access restored by school office' },
    });
    assert.equal(restored.status, 200);
    assert.equal((await ParentAccount.findOne({ userId: parentUser._id }).lean()).status, 'active');
    assert.equal((await api('/api/auth/login', {
      method: 'POST',
      body: { email: parentEmail, password: 'AnotherStrongFamilyPassword456' },
    })).status, 200);
  });
  await t.test('registered parent email plus mobile also activates, while duplicate same-phone claims are blocked', async () => {
    const duplicate = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[0].stuNo,
        phone,
        fullName: 'Another Login',
        email: 'duplicate-' + tag + '@example.test',
        password: 'StrongDuplicateFamilyPassword123',
      },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(await User.countDocuments({ email: 'duplicate-' + tag + '@example.test' }), 0);

    const emailActivation = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: 'other-' + tag + '@example.test',
        phone: '9123456789',
        fullName: 'Other Parent',
        email: 'other-' + tag + '@example.test',
        password: 'StrongOtherFamilyPassword123',
      },
    });
    assert.equal(emailActivation.status, 201);
    assert.equal(emailActivation.data.user.role, 'parent');
    createdUserIds.push(new mongoose.Types.ObjectId(emailActivation.data.user.id));
    const otherAccount = await ParentAccount.findOne({ userId: emailActivation.data.user.id }).lean();
    assert.equal(otherAccount.studentIds.length, 1);
    assert.equal(String(otherAccount.studentIds[0]), String(students[2]._id));
  });

});
