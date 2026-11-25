'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('report templates preserve saved student marks and historical grading scales', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_report_history_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const ReportCard = require('../models/ReportCard');
  const Subject = require('../models/Subject');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'Report Admin ' + tag,
    email: 'report-admin-' + tag + '@example.test',
    password: 'ReportAdminPassword123',
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

  const student = await Student.create({
    firstName: 'Aarav',
    middleName: 'Test',
    lastName: tag,
    standard: 'ENG JR.',
    stuNo: 'RPT-' + tag,
    batchYear: '2026-2027',
  });
  const historicalReport = await ReportCard.create({
    reportName: 'Term 1 ' + tag,
    standard: 'ENG JR.',
    description: '100',
    students: [student._id],
  });
  student.marks.push({
    reportId: historicalReport._id,
    subjectData: [{ subject: 'English', mark: 80, date: '2026-11-21' }],
    total: 80,
    percentage: 80,
    grade: 'A',
  });
  await student.save();

  await t.test('DOCX export uses the full student name and validates the report relationship', async () => {
    const response = await fetch(
      new URL('/api/docx/generate-docx/' + student._id + '/' + historicalReport._id, 'http://127.0.0.1:' + server.address().port),
      { headers: { 'x-auth-token': token } },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
    assert.match(response.headers.get('content-disposition') || '', /Progress_Report_Aarav_Test_/);
    assert.ok((await response.arrayBuffer()).byteLength > 500);

    const invalid = await fetch(
      new URL('/api/docx/generate-docx/not-an-id/' + historicalReport._id, 'http://127.0.0.1:' + server.address().port),
      { headers: { 'x-auth-token': token } },
    );
    assert.equal(invalid.status, 400);

    const unrelated = await ReportCard.create({
      reportName: 'Not linked ' + tag,
      standard: 'ENG JR.',
      description: '100',
      students: [],
    });
    const forbidden = await fetch(
      new URL('/api/docx/generate-docx/' + student._id + '/' + unrelated._id, 'http://127.0.0.1:' + server.address().port),
      { headers: { 'x-auth-token': token } },
    );
    assert.equal(forbidden.status, 403);
  });

  await t.test('templates include students admitted after creation and allow marks entry', async () => {
    const templateResponse = await api('/api/reportCard/create', {
      method: 'POST',
      body: { reportName: 'New admission report ' + tag, standard: 'GUJ NR.', description: '20' },
    });
    assert.equal(templateResponse.status, 201);
    const template = templateResponse.data.newReport;
    assert.deepEqual(template.students, []);

    const newStudent = await Student.create({
      firstName: 'New',
      middleName: 'Admission',
      lastName: tag,
      standard: 'GUJ NR.',
      stuNo: 'RPT-NEW-' + tag,
      batchYear: '2026-2027',
    });
    await Subject.create({ standard: 'GUJ NR.', subjects: ['Language', 'Numbers'] });

    const rosterResponse = await api('/api/reportCard/' + template._id + '/roster');
    assert.equal(rosterResponse.status, 200);
    assert.equal(rosterResponse.data.students.length, 1);
    assert.equal(String(rosterResponse.data.students[0]._id), String(newStudent._id));
    assert.equal(rosterResponse.data.students[0].batchYear, '2026-2027');
    assert.deepEqual(rosterResponse.data.subjects, ['Language', 'Numbers']);

    const marksResponse = await api('/api/students/' + newStudent._id + '/' + template._id, {
      method: 'POST',
      body: { subjectData: [
        { subject: 'Language', mark: 15, date: '2026-11-21' },
        { subject: 'Numbers', mark: 15, date: '2026-11-21' },
      ] },
    });
    assert.equal(marksResponse.status, 200);
    assert.equal(marksResponse.data.total, 30);
    assert.equal(marksResponse.data.percentage, 75);
    assert.equal(marksResponse.data.grade, 'B');

    const savedMarks = await api('/api/students/' + newStudent._id + '/' + template._id);
    assert.equal(savedMarks.status, 200);
    assert.equal(savedMarks.data.subjectData.length, 2);

    const exportResponse = await api('/api/reportCard/' + template._id + '/students');
    assert.equal(exportResponse.status, 200);
    assert.equal(exportResponse.data.length, 1);
    assert.equal(exportResponse.data[0].total, 30);
    assert.ok(await ReportCard.exists({ _id: template._id, students: newStudent._id }));
  });

  await t.test('saved marks prevent deletion of their report template', async () => {
    const response = await api('/api/reportCard/' + historicalReport._id, { method: 'DELETE' });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'REPORT_HISTORY_PRESERVED');
    assert.ok(await ReportCard.exists({ _id: historicalReport._id }));
  });

  await t.test('saved marks prevent changes to the historical maximum-mark scale', async () => {
    const response = await api('/api/reportCard/' + historicalReport._id, {
      method: 'PUT',
      body: { description: '50' },
    });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'REPORT_MARKS_ALREADY_RECORDED');

    const unchanged = await ReportCard.findById(historicalReport._id).lean();
    assert.equal(unchanged.description, '100');
  });

  await t.test('report name can be corrected without altering saved marks or the grading scale', async () => {
    const response = await api('/api/reportCard/' + historicalReport._id, {
      method: 'PUT',
      body: { reportName: 'Corrected Term 1 ' + tag },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.report.description, '100');
  });

  await t.test('unused report templates can still be deleted', async () => {
    const unused = await ReportCard.create({
      reportName: 'Unused ' + tag,
      standard: 'ENG JR.',
      description: '100',
      students: [],
    });
    const response = await api('/api/reportCard/' + unused._id, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.equal(await ReportCard.exists({ _id: unused._id }), null);
  });
});
