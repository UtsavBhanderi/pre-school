'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('student deletion preserves parent, academic and paid-fee history', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_student_deletion_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Student = require('../models/Student');
  const Fees = require('../models/Fee');
  const ReportCard = require('../models/ReportCard');
  const ParentAccount = require('../models/ParentAccount');
  const Attendance = require('../models/Attendance');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'Student Admin ' + tag,
    email: 'student-admin-' + tag + '@example.test',
    password: 'StudentAdminPassword123',
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

  await t.test('student profile returns linked academic reports and working attendance history', async () => {
    const student = await Student.create({
      firstName: 'Profile',
      middleName: 'Academic',
      lastName: 'Student',
      standard: 'ENG JR.',
      stuNo: 'PROFILE-' + tag,
    });
    const historicalReport = await ReportCard.create({
      reportName: 'Historical report ' + tag,
      standard: 'ENG JR.',
      description: '100',
      students: [],
    });
    student.marks.push({
      reportId: historicalReport._id,
      subjectData: [
        { subject: 'English', mark: 82, date: '2026-11-19' },
        { subject: 'Maths', mark: 91, date: '2026-11-19' },
      ],
      total: 173,
      percentage: 86.5,
      grade: 'A',
    });
    await student.save();

    await Attendance.create([
      {
        date: new Date('2026-11-20T00:00:00.000Z'),
        standard: 'ENG JR.',
        studentDetails: [{ studentId: student._id, status: 'present', reason: '' }],
      },
      {
        date: new Date('2026-11-19T00:00:00.000Z'),
        standard: 'ENG JR.',
        studentDetails: [{ studentId: student._id, status: 'absent', reason: 'Fever' }],
      },
    ]);

    const response = await api('/api/students/student-profile/' + student._id);
    assert.equal(response.status, 200);
    assert.equal(response.data.reports.length, 1);
    assert.equal(String(response.data.reports[0]._id), String(historicalReport._id));
    assert.equal(response.data.student.marks[0].subjectData.length, 2);
    assert.deepEqual(response.data.attendance.summary, {
      totalDays: 2,
      present: 1,
      absent: 1,
      percentage: 50,
      lastRecordedOn: '2026-11-20',
    });
    assert.deepEqual(response.data.attendance.records.map((record) => record.status), ['present', 'absent']);
    assert.equal(response.data.attendance.records[1].reason, 'Fever');
  });


  await t.test('promotion, transfer, withdrawal and reactivation preserve student and fee history', async () => {
    const student = await Student.create({ firstName: 'Lifecycle', middleName: 'Test', lastName: 'Student', standard: 'ENG NR.', batchYear: '2026-2027', stuNo: 'LIFECYCLE-' + tag });
    await Fees.updateOne({ stuNo: student.stuNo }, { $set: { totalFeesPaid: 250, paymentDetails: [{ date: '11/21/2026', time: '10:00 AM', amount: 250 }] } });
    const promotion = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'promotion', effectiveDate: '2026-12-01', targetStandard: 'ENG JR.', targetBatchYear: '2027-2028', reason: 'Annual promotion' } });
    assert.equal(promotion.status, 200);
    assert.equal(promotion.data.student.standard, 'ENG JR.');
    assert.equal(promotion.data.student.academicHistory.at(-1).action, 'promotion');
    const feeAfterPromotion = await Fees.findOne({ stuNo: student.stuNo }).lean();
    assert.equal(feeAfterPromotion.standard, 'ENG JR.');
    assert.equal(feeAfterPromotion.batchYear, '2027-2028');
    assert.equal(feeAfterPromotion.totalFeesPaid, 250);
    assert.equal(feeAfterPromotion.paymentDetails.length, 1);
    const transfer = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'transfer', effectiveDate: '2027-01-05', targetStandard: 'GUJ JR.', targetBatchYear: '2027-2028', reason: 'Language section change' } });
    assert.equal(transfer.status, 200);
    assert.equal(transfer.data.student.standard, 'GUJ JR.');
    const withdrawal = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'withdraw', effectiveDate: '2027-02-01', reason: 'Family relocation' } });
    assert.equal(withdrawal.status, 200);
    assert.equal(withdrawal.data.student.status, 'withdrawn');
    assert.ok(await Student.exists({ _id: student._id }));
    const withdrawnRoster = await api('/api/students/GUJ JR.');
    assert.equal(withdrawnRoster.status, 200);
    assert.equal(withdrawnRoster.data.some((item) => String(item._id) === String(student._id)), false);
    const reactivation = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'reactivate', effectiveDate: '2027-03-01', reason: 'Family returned' } });
    assert.equal(reactivation.status, 200);
    assert.equal(reactivation.data.student.status, 'active');
    assert.equal(reactivation.data.student.academicHistory.length, 4);
    const activeRoster = await api('/api/students/GUJ JR.');
    assert.equal(activeRoster.data.some((item) => String(item._id) === String(student._id)), true);
  });

  await t.test('lifecycle endpoint rejects invalid dates, reasons and destination classes', async () => {
    const student = await Student.create({ firstName: 'Invalid', standard: 'ENG NR.', stuNo: 'LIFECYCLE-INVALID-' + tag });
    const invalidDate = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'promotion', effectiveDate: '2026-02-30', targetStandard: 'ENG JR.', reason: 'Promotion' } });
    assert.equal(invalidDate.status, 400);
    const noReason = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'withdraw', effectiveDate: '2026-11-22', reason: '' } });
    assert.equal(noReason.status, 400);
    const sameClass = await api('/api/students/' + student._id + '/lifecycle', { method: 'PATCH', body: { action: 'promotion', effectiveDate: '2026-11-22', targetStandard: 'ENG NR.', reason: 'Promotion' } });
    assert.equal(sameClass.status, 400);
    assert.equal((await Student.findById(student._id).lean()).status, 'active');
  });

  await t.test('paid fee history blocks student deletion', async () => {
    const student = await Student.create({
      firstName: 'Paid',
      standard: 'ENG JR.',
      stuNo: 'DEL-PAID-' + tag,
    });
    await Fees.updateOne(
      { stuNo: student.stuNo },
      { $set: { totalFeesPaid: 100, paymentDetails: [{ date: '11/21/2026', time: '10:00 AM', amount: 100 }] } },
    );
    const response = await api('/api/students/' + student._id, { method: 'DELETE' });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'STUDENT_PAYMENT_HISTORY_PRESERVED');
    assert.ok(await Student.exists({ _id: student._id }));
    assert.ok(await Fees.exists({ stuNo: student.stuNo }));
  });

  await t.test('parent portal access blocks student deletion', async () => {
    const student = await Student.create({
      firstName: 'Linked',
      standard: 'ENG JR.',
      stuNo: 'DEL-PARENT-' + tag,
    });
    const parent = await User.create({
      username: 'Parent ' + tag,
      email: 'student-parent-' + tag + '@example.test',
      password: 'ParentPassword123',
      role: 'parent',
    });
    await ParentAccount.create({ userId: parent._id, studentIds: [student._id], registeredPhone: '9876543210' });
    const response = await api('/api/students/' + student._id, { method: 'DELETE' });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'STUDENT_PARENT_ACCESS_PRESERVED');
    assert.ok(await Student.exists({ _id: student._id }));
  });

  await t.test('report-card template links block student deletion', async () => {
    const student = await Student.create({
      firstName: 'Report',
      standard: 'ENG JR.',
      stuNo: 'DEL-REPORT-' + tag,
    });
    await ReportCard.create({
      reportName: 'Linked report ' + tag,
      standard: 'ENG JR.',
      description: '100',
      students: [student._id],
    });
    const response = await api('/api/students/' + student._id, { method: 'DELETE' });
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'STUDENT_REPORT_HISTORY_PRESERVED');
    assert.ok(await Student.exists({ _id: student._id }));
  });

  await t.test('an unused student and its unpaid fee schedule can be deleted', async () => {
    const student = await Student.create({
      firstName: 'Unused',
      standard: 'ENG JR.',
      stuNo: 'DEL-UNUSED-' + tag,
    });
    const response = await api('/api/students/' + student._id, { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.equal(await Student.exists({ _id: student._id }), null);
    assert.equal(await Fees.exists({ stuNo: student.stuNo }), null);
  });
});
