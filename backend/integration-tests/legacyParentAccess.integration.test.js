'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('single-school parents can sign in with GR/email plus registered mobile and only see linked children', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB instance.' : false,
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
    {
      stuNo: 'GR-' + tag + '-004', firstName: 'Phone', lastName: 'Fields Only',
      standard: 'Nursery', parentEmail: 'phone-fields-' + tag + '@example.test',
      phoneNumber: '9000000000', EmergencyPhoneNumber: '9111111111',
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

  await t.test('a GR number without its registered mobile cannot create a parent account', async () => {
    const response = await api('/api/parent-access/login', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[0].stuNo,
        phone: '9123456789',
      },
    });
    assert.equal(response.status, 404);
    assert.equal(response.data.code, 'PARENT_RECORD_NOT_MATCHED');
    assert.equal(await ParentAccount.countDocuments({}), 0);
    assert.equal(await User.countDocuments({ role: 'parent' }), 0);
  });

  await t.test('student and emergency contact phone numbers cannot activate a parent account', async () => {
    const studentPhone = await api('/api/parent-access/login', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[3].stuNo,
        phone: students[3].phoneNumber,
      },
    });
    const emergencyPhone = await api('/api/parent-access/login', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[3].stuNo,
        phone: students[3].EmergencyPhoneNumber,
      },
    });
    assert.equal(studentPhone.status, 404);
    assert.equal(studentPhone.data.code, 'PARENT_RECORD_NOT_MATCHED');
    assert.equal(emergencyPhone.status, 404);
    assert.equal(emergencyPhone.data.code, 'PARENT_RECORD_NOT_MATCHED');
    assert.equal(await ParentAccount.countDocuments({}), 0);
    assert.equal(await User.countDocuments({ role: 'parent' }), 0);
  });

  let activation;
  await t.test('GR number plus registered mobile signs in without registration or a password', async () => {
    activation = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: students[0].stuNo,
        phone: '+91 98765 43210',
      },
    });
    assert.equal(activation.status, 200);
    assert.ok(activation.data.token);
    assert.equal(activation.data.user.role, 'parent');

    const user = await User.findById(activation.data.user.id);
    assert.ok(user.email.endsWith('@parent-login.invalid'));
    createdUserIds.push(user._id);
    const parentAccount = await ParentAccount.findOne({ userId: user._id }).select('+registeredPhone').lean();
    assert.ok(parentAccount);
    assert.equal(parentAccount.registeredPhone, phone);
    assert.equal(parentAccount.studentIds.length, 2);
  });

  const parentToken = activation.data.token;
  await t.test('the issued session identifies the parent and linked child count', async () => {
    const me = await api('/api/auth/me', { token: parentToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.role, 'parent');
    assert.equal(me.data.user.parentAccount.mode, 'legacy_single_school');
    assert.equal(me.data.user.parentAccount.studentCount, 2);
  });

  await t.test('a changed school-record mobile cannot create a second family account', async () => {
    const originalMobile = students[0].FatherMobileNumber;
    await Student.updateOne({ _id: students[0]._id }, { $set: { FatherMobileNumber: 9988776655 } });
    let changedMobileLogin;
    try {
      changedMobileLogin = await api('/api/parent-access/login', {
        method: 'POST',
        body: {
          schoolSlug: 'family-access-school',
          identifier: students[0].stuNo,
          phone: '9988776655',
        },
      });
    } finally {
      await Student.updateOne({ _id: students[0]._id }, { $set: { FatherMobileNumber: originalMobile } });
    }
    assert.equal(changedMobileLogin.status, 409);
    assert.equal(changedMobileLogin.data.code, 'PARENT_PHONE_CHANGE_REQUIRED');
    assert.equal(await ParentAccount.countDocuments({}), 1);
    assert.equal(await User.countDocuments({ role: 'parent' }), 1);
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

  await t.test('administrator can suspend and restore parent access without MongoDB transactions', async () => {
    const parentUser = await User.findById(activation.data.user.id);
    assert.ok(parentUser);

    const originalStartSession = mongoose.startSession;
    mongoose.startSession = async () => {
      throw new Error('Transactions are unavailable on a standalone MongoDB server.');
    };

    try {
      const suspended = await api('/api/userDetailsself/' + parentUser._id, {
        token: adminToken,
        method: 'PATCH',
        body: { status: 'suspended', role: 'parent', reason: 'Parent access requested suspension' },
      });
      assert.equal(suspended.status, 200);
      assert.equal(suspended.data.user.status, 'suspended');
      assert.equal((await User.findById(parentUser._id)).status, 'suspended');
      assert.equal((await api('/api/auth/me', { token: parentToken })).status, 401);
      const blockedParentLogin = await api('/api/parent-access/login', {
        method: 'POST',
        body: { schoolSlug: 'family-access-school', identifier: students[0].stuNo, phone },
      });
      assert.equal(blockedParentLogin.status, 403);
      assert.equal(blockedParentLogin.data.code, 'PARENT_ACCESS_INACTIVE');

      // Simulate a legacy parent-account status value left behind by an older
      // release. User.status is now the single authority for account access.
      await ParentAccount.updateOne({ userId: parentUser._id }, { $set: { status: 'suspended' } });
      const restored = await api('/api/userDetailsself/' + parentUser._id, {
        token: adminToken,
        method: 'PATCH',
        body: { status: 'active', role: 'parent', reason: 'Parent access restored by school office' },
      });
      assert.equal(restored.status, 200);
      assert.equal((await User.findById(parentUser._id)).status, 'active');
      assert.equal((await ParentAccount.findOne({ userId: parentUser._id }).lean()).status, 'suspended',
        'The old mirror field must not override the restored user account.');
      // Restoring the account never revives a previously issued token.
      assert.equal((await api('/api/auth/me', { token: parentToken })).status, 401);
      const freshLogin = await api('/api/parent-access/login', {
        method: 'POST',
        body: { schoolSlug: 'family-access-school', identifier: students[0].stuNo, phone },
      });
      assert.equal(freshLogin.status, 200);
      assert.equal(freshLogin.data.user.id, activation.data.user.id);
      assert.equal((await ParentAccount.findOne({ userId: parentUser._id }).lean()).status, 'suspended',
        'Direct sign-in must not rewrite the legacy status mirror.');
      const engagementAfterRestore = await api('/api/school-engagement/parent/homework', {
        token: freshLogin.data.token,
      });
      assert.equal(engagementAfterRestore.status, 200,
        'A fresh session for a restored parent must access family engagement despite a stale legacy status field.');
    } finally {
      mongoose.startSession = originalStartSession;
    }
  });

  await t.test('registered parent email reuses the existing family account', async () => {
    const emailLogin = await api('/api/parent-access/login', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: parentEmail,
        phone,
      },
    });
    assert.equal(emailLogin.status, 200);
    assert.equal(emailLogin.data.user.id, activation.data.user.id);
    assert.equal(await ParentAccount.countDocuments({}), 1);
  });

  await t.test('another child family can sign in independently using its saved email and mobile', async () => {
    const otherEmail = 'other-' + tag + '@example.test';
    const otherLogin = await api('/api/parent-access/login', {
      method: 'POST',
      body: {
        schoolSlug: 'family-access-school',
        identifier: otherEmail,
        phone: '9123456789',
      },
    });
    assert.equal(otherLogin.status, 200);
    assert.equal(otherLogin.data.user.role, 'parent');
    createdUserIds.push(new mongoose.Types.ObjectId(otherLogin.data.user.id));
    const otherAccount = await ParentAccount.findOne({ userId: otherLogin.data.user.id }).lean();
    assert.equal(otherAccount.studentIds.length, 1);
    assert.equal(String(otherAccount.studentIds[0]), String(students[2]._id));
  });

});
