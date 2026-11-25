'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('teachers can prepare only their assigned class report cards and saved results reach linked parents', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_teacher_reports_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Teacher = require('../models/Teacher');
  const Student = require('../models/Student');
  const ParentAccount = require('../models/ParentAccount');
  const ReportCard = require('../models/ReportCard');
  const Subject = require('../models/Subject');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const teacher = await User.create({
    username: 'Nursery Teacher ' + tag,
    email: 'nursery-teacher-' + tag + '@example.test',
    password: 'NurseryTeacherPassword123',
    role: 'teacher',
  });
  const otherTeacher = await User.create({
    username: 'Unassigned Teacher ' + tag,
    email: 'unassigned-' + tag + '@example.test',
    password: 'UnassignedTeacherPassword123',
    role: 'teacher',
  });
  const admin = await User.create({
    username: 'Report Administrator ' + tag,
    email: 'report-admin-' + tag + '@example.test',
    password: 'ReportAdminPassword123',
    role: 'admin',
  });
  const parent = await User.create({
    username: 'Aarav Parent ' + tag,
    email: 'aarav-parent-' + tag + '@example.test',
    password: 'AaravParentPassword123',
    role: 'parent',
  });
  const otherParent = await User.create({
    username: 'Other Class Parent ' + tag,
    email: 'other-parent-' + tag + '@example.test',
    password: 'OtherParentPassword123',
    role: 'parent',
  });

  await Teacher.create({
    Email: teacher.email,
    standard: 'Nursery',
    GR_No: 'TR-' + tag,
  });
  const child = await Student.create({
    firstName: 'Aarav',
    middleName: 'Parent',
    lastName: 'Child',
    standard: 'Nursery',
    stuNo: 'TR-CHILD-' + tag,
    batchYear: '2026-2027',
  });
  const otherChild = await Student.create({
    firstName: 'Other',
    lastName: 'Class Child',
    standard: 'Primary',
    stuNo: 'TR-OTHER-' + tag,
    batchYear: '2026-2027',
  });
  await ParentAccount.create({
    userId: parent._id,
    studentIds: [child._id],
    registeredPhone: '9876543210',
  });
  await ParentAccount.create({
    userId: otherParent._id,
    studentIds: [otherChild._id],
    registeredPhone: '9123456789',
  });

  const classReport = await ReportCard.create({
    reportName: 'Nursery Term 1 ' + tag,
    standard: 'Nursery',
    description: '100',
    students: [],
  });
  const otherClassReport = await ReportCard.create({
    reportName: 'Primary Term 1 ' + tag,
    standard: 'Primary',
    description: '100',
    students: [otherChild._id],
  });
  await Subject.create({ standard: 'Nursery', subjects: ['Language', 'Numbers'] });

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role, authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const tokens = {
    teacher: tokenFor(teacher),
    unassigned: tokenFor(otherTeacher),
    admin: tokenFor(admin),
    parent: tokenFor(parent),
    otherParent: tokenFor(otherParent),
  };

  async function api(pathname, { role = 'teacher', method = 'GET', body } = {}) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: {
        'x-auth-token': tokens[role],
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

  await t.test('teacher list contains only templates for the teacher assigned class', async () => {
    const response = await api('/api/teacher-report-cards');
    assert.equal(response.status, 200);
    assert.equal(response.data.length, 1);
    assert.equal(String(response.data[0]._id), String(classReport._id));
    assert.equal(response.data[0].standard, 'Nursery');
  });

  await t.test('teacher roster contains only active students in the assigned class', async () => {
    const response = await api('/api/teacher-report-cards/' + classReport._id + '/roster');
    assert.equal(response.status, 200);
    assert.equal(response.data.students.length, 1);
    assert.equal(String(response.data.students[0]._id), String(child._id));
    assert.deepEqual(response.data.subjects, ['Language', 'Numbers']);
    const savedTemplate = await ReportCard.findById(classReport._id).lean();
    assert.ok(savedTemplate.students.some((id) => String(id) === String(child._id)));
    assert.equal(savedTemplate.students.some((id) => String(id) === String(otherChild._id)), false);
  });

  await t.test('teacher cannot inspect a different class report or an unassigned teacher workspace', async () => {
    const wrongClass = await api('/api/teacher-report-cards/' + otherClassReport._id + '/roster');
    assert.equal(wrongClass.status, 404);
    const unassignedList = await api('/api/teacher-report-cards', { role: 'unassigned' });
    assert.equal(unassignedList.status, 403);
    const administratorDenied = await api('/api/teacher-report-cards', { role: 'admin' });
    assert.equal(administratorDenied.status, 403);
  });

  await t.test('teacher saves class results and only the linked parent receives them', async () => {
    const saved = await api('/api/teacher-report-cards/' + classReport._id + '/students/' + child._id, {
      method: 'POST',
      body: {
        subjectData: [
          { subject: 'Language', mark: 18, date: '2026-11-20' },
          { subject: 'Numbers', mark: 17, date: '2026-11-20' },
        ],
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.total, 35);
    assert.equal(saved.data.percentage, 17.5);

    const parentReports = await api('/api/parent-portal/reports', { role: 'parent' });
    assert.equal(parentReports.status, 200);
    assert.equal(parentReports.data.reports.length, 1);
    const published = parentReports.data.reports[0];
    assert.equal(published.title, classReport.reportName);
    assert.equal(published.children.length, 1);
    assert.equal(published.children[0].id, String(child._id));
    assert.equal(published.children[0].result.total, 35);
    assert.equal(published.children[0].result.percentage, 17.5);
    assert.deepEqual(published.children[0].result.subjects.map((item) => [item.subject, item.mark]), [
      ['Language', 18],
      ['Numbers', 17],
    ]);

    const otherParentReports = await api('/api/parent-portal/reports', { role: 'otherParent' });
    assert.equal(otherParentReports.status, 200);
    assert.deepEqual(otherParentReports.data.reports, []);
  });

  await t.test('template students without saved marks are not shown as published parent reports', async () => {
    const unfinished = await ReportCard.create({
      reportName: 'Unfinished Term ' + tag,
      standard: 'Nursery',
      description: '100',
      students: [child._id],
    });
    const response = await api('/api/parent-portal/reports', { role: 'parent' });
    assert.equal(response.status, 200);
    assert.ok(response.data.reports.every((report) => report.id !== String(unfinished._id)));
  });

  await t.test('teacher result entry validates every configured subject and assessment date', async () => {
    const invalid = await api('/api/teacher-report-cards/' + classReport._id + '/students/' + child._id, {
      method: 'POST',
      body: {
        subjectData: [
          { subject: 'Language', mark: 18, date: '2026-02-30' },
          { subject: 'Numbers', mark: 17, date: '2026-11-20' },
        ],
      },
    });
    assert.equal(invalid.status, 400);
  });
});
