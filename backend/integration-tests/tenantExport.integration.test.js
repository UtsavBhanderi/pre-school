'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

function localDateYmd(timeZone = 'Asia/Kolkata', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

test('CSV exports enforce tenant and role scope, neutralize formulas and write audit events', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const Student = require('../models/Student');
  const Attendance = require('../models/Attendance');
  const FeeInvoice = require('../models/FeeInvoice');
  const FeeTransaction = require('../models/FeeTransaction');
  const TenantSequence = require('../models/TenantSequence');
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const userIds = [];
  const organizationIds = [];
  const branchIds = [];

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function requestCsv(path, { token, organizationId, branchId, query = {} } = {}) {
    const url = new URL(path, 'http://127.0.0.1:' + server.address().port);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: {
        'x-auth-token': token,
        'x-organization-id': String(organizationId),
        'x-branch-id': String(branchId),
      },
    });
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      disposition: response.headers.get('content-disposition') || '',
      body: await response.text(),
    };
  }

  async function makeUser(role, label) {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'integration-test-password-' + tag,
      role,
    });
    userIds.push(user._id);
    return user;
  }

  async function makeTenant(owner, label) {
    const organization = await Organization.create({
      name: 'Export Test ' + label + ' ' + tag,
      slug: 'export-' + label.toLowerCase() + '-' + tag,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      currency: 'INR',
      status: 'active',
      createdBy: owner._id,
    });
    organizationIds.push(organization._id);
    const branch = await Branch.create({
      organizationId: organization._id,
      name: 'Main ' + label,
      code: label.toUpperCase() + '-' + tag.slice(0, 5),
      timezone: 'Asia/Kolkata',
      status: 'active',
      createdBy: owner._id,
    });
    branchIds.push(branch._id);
    return { organization, branch };
  }

  async function addMembership(user, organization, branch, role, options = {}) {
    return OrganizationMembership.create({
      organizationId: organization._id,
      userId: user._id,
      role,
      branchIds: options.branchIds || [branch._id],
      classNames: options.classNames || [],
      guardianIds: [],
      accessAllBranches: options.accessAllBranches === true,
      status: 'active',
      activatedAt: new Date(),
    });
  }

  async function makeChild({ organization, branch, user, name, admission }) {
    return Student.create({
      firstName: name,
      middleName: 'Export',
      lastName: 'Test',
      standard: 'Nursery',
      batchYear: '2026-2027',
      dob: '2023-06-01',
      stuNo: admission + '-' + tag,
      organizationId: organization._id,
      branchId: branch._id,
      createdBy: user._id,
    });
  }

  async function makeInvoice({ organization, branch, child, user, label }) {
    return FeeInvoice.create({
      organizationId: organization._id,
      branchId: branch._id,
      childId: child._id,
      invoiceNumber: 'INV-' + label + '-' + tag,
      academicYear: '2026-2027',
      lineItems: [{
        description: 'Tuition fee',
        quantity: 1,
        unitAmountPaise: 12500,
        lineTotalPaise: 12500,
      }],
      subtotalPaise: 12500,
      discountPaise: 0,
      totalAmountPaise: 12500,
      createdBy: user._id,
    });
  }

  async function cleanUp() {
    if (organizationIds.length) {
      const organizationFilter = { organizationId: { $in: organizationIds } };
      await Promise.allSettled([
        FeeTransaction.deleteMany(organizationFilter),
        FeeInvoice.deleteMany(organizationFilter),
        Attendance.deleteMany(organizationFilter),
        Student.deleteMany(organizationFilter),
        TenantSequence.deleteMany(organizationFilter),
        AuditEvent.deleteMany(organizationFilter),
        OrganizationMembership.deleteMany(organizationFilter),
        Branch.deleteMany({ _id: { $in: branchIds } }),
        Organization.deleteMany({ _id: { $in: organizationIds } }),
      ]);
    }
    if (userIds.length) await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanUp);

  const ownerA = await makeUser('admin', 'csv-owner-a');
  const ownerB = await makeUser('admin', 'csv-owner-b');
  const teacherA = await makeUser('teacher', 'csv-teacher-a');
  const tenantA = await makeTenant(ownerA, 'Alpha');
  const tenantB = await makeTenant(ownerB, 'Beta');

  await Promise.all([
    addMembership(ownerA, tenantA.organization, tenantA.branch, 'organization_owner', { accessAllBranches: true }),
    addMembership(ownerB, tenantB.organization, tenantB.branch, 'organization_owner', { accessAllBranches: true }),
    addMembership(teacherA, tenantA.organization, tenantA.branch, 'teacher', { classNames: ['Nursery'] }),
  ]);

  const childA = await makeChild({
    organization: tenantA.organization,
    branch: tenantA.branch,
    user: ownerA,
    name: 'Alpha Child',
    admission: 'A-' + tag,
  });
  const childB = await makeChild({
    organization: tenantB.organization,
    branch: tenantB.branch,
    user: ownerB,
    name: 'Beta Child',
    admission: 'B-' + tag,
  });

  const date = localDateYmd();
  const attendanceDate = new Date(date + 'T00:00:00.000Z');
  const formulaReason = '=HYPERLINK("http://example.invalid","open")';
  await Promise.all([
    Attendance.create({
      organizationId: tenantA.organization._id,
      branchId: tenantA.branch._id,
      standard: 'Nursery',
      recordedBy: ownerA._id,
      date: attendanceDate,
      studentDetails: [{ studentId: childA._id, status: 'absent', reason: formulaReason }],
    }),
    Attendance.create({
      organizationId: tenantB.organization._id,
      branchId: tenantB.branch._id,
      standard: 'Nursery',
      recordedBy: ownerB._id,
      date: attendanceDate,
      studentDetails: [{ studentId: childB._id, status: 'present', reason: '' }],
    }),
  ]);

  const invoiceA = await makeInvoice({
    organization: tenantA.organization,
    branch: tenantA.branch,
    child: childA,
    user: ownerA,
    label: 'A',
  });
  const invoiceB = await makeInvoice({
    organization: tenantB.organization,
    branch: tenantB.branch,
    child: childB,
    user: ownerB,
    label: 'B',
  });

  const formulaReference = '=HYPERLINK("http://example.invalid","open")';
  const receiptA = 'REC-A-' + tag;
  const receiptB = 'REC-B-' + tag;
  await Promise.all([
    FeeTransaction.create({
      organizationId: tenantA.organization._id,
      branchId: tenantA.branch._id,
      invoiceId: invoiceA._id,
      childId: childA._id,
      receiptNumber: receiptA,
      type: 'payment',
      amountPaise: 12500,
      method: 'upi',
      reference: formulaReference,
      transactionAt: new Date(),
      recordedBy: ownerA._id,
    }),
    FeeTransaction.create({
      organizationId: tenantB.organization._id,
      branchId: tenantB.branch._id,
      invoiceId: invoiceB._id,
      childId: childB._id,
      receiptNumber: receiptB,
      type: 'payment',
      amountPaise: 12500,
      method: 'cash',
      reference: 'cash-counter',
      transactionAt: new Date(),
      recordedBy: ownerB._id,
    }),
  ]);

  const ownerACtx = {
    token: tokenFor(ownerA),
    organizationId: tenantA.organization._id,
    branchId: tenantA.branch._id,
  };
  const ownerBCtx = {
    token: tokenFor(ownerB),
    organizationId: tenantB.organization._id,
    branchId: tenantB.branch._id,
  };
  const teacherCtx = {
    token: tokenFor(teacherA),
    organizationId: tenantA.organization._id,
    branchId: tenantA.branch._id,
  };

  await t.test('attendance CSV is scoped and safely escapes formula-like child data', async () => {
    const report = await requestCsv('/api/saas/operations/reports/attendance.csv', {
      ...ownerACtx,
      query: { from: date, to: date, className: 'Nursery' },
    });
    assert.equal(report.status, 200, report.body);
    assert.match(report.contentType, /text\/csv/i);
    assert.match(report.disposition, /attendance-/);
    assert.ok(report.body.startsWith('\uFEFFDate,Class,Admission number'));
    assert.ok(report.body.includes('Alpha Child'));
    assert.ok(!report.body.includes('Beta Child'));
    assert.ok(report.body.includes("'=HYPERLINK"));
    assert.ok(report.body.includes('Nursery'));

    const otherTenantReport = await requestCsv('/api/saas/operations/reports/attendance.csv', {
      ...ownerBCtx,
      query: { from: date, to: date, className: 'Nursery' },
    });
    assert.equal(otherTenantReport.status, 200, otherTenantReport.body);
    assert.ok(otherTenantReport.body.includes('Beta Child'));
    assert.ok(!otherTenantReport.body.includes('Alpha Child'));

    const teacherReport = await requestCsv('/api/saas/operations/reports/attendance.csv', {
      ...teacherCtx,
      query: { from: date, to: date, className: 'Other class' },
    });
    assert.equal(teacherReport.status, 403);
  });

  await t.test('fee CSV stays in branch scope, denies teacher financial access and neutralizes spreadsheet formulas', async () => {
    const report = await requestCsv('/api/saas/operations/reports/fees.csv', {
      ...ownerACtx,
      query: { from: date, to: date },
    });
    assert.equal(report.status, 200, report.body);
    assert.match(report.contentType, /text\/csv/i);
    assert.ok(report.body.includes(receiptA));
    assert.ok(report.body.includes('Alpha Child'));
    assert.ok(!report.body.includes(receiptB));
    assert.ok(!report.body.includes('Beta Child'));
    assert.ok(report.body.includes("'=HYPERLINK"));

    const otherTenantReport = await requestCsv('/api/saas/operations/reports/fees.csv', {
      ...ownerBCtx,
      query: { from: date, to: date },
    });
    assert.equal(otherTenantReport.status, 200, otherTenantReport.body);
    assert.ok(otherTenantReport.body.includes(receiptB));
    assert.ok(!otherTenantReport.body.includes(receiptA));

    const teacherReport = await requestCsv('/api/saas/operations/reports/fees.csv', {
      ...teacherCtx,
      query: { from: date, to: date },
    });
    assert.equal(teacherReport.status, 403);
  });

  await t.test('CSV exports leave an audit trail and reject missing branch context', async () => {
    const missingBranch = await requestCsv('/api/saas/operations/reports/fees.csv', {
      token: ownerACtx.token,
      organizationId: ownerACtx.organizationId,
      query: { from: date, to: date },
    });
    assert.equal(missingBranch.status, 400);

    const events = await AuditEvent.find({
      organizationId: tenantA.organization._id,
      action: 'report.exported',
    }).select('resourceId branchId').lean();
    assert.ok(events.some((event) => event.resourceId === 'attendance'));
    assert.ok(events.some((event) => event.resourceId === 'fees'));
    assert.ok(events.every((event) => String(event.branchId) === String(tenantA.branch._id)));
  });
});
