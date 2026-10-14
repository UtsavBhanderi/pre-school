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

test('tenant notices, calendar, handover and teacher work reports remain branch-scoped and audited', {
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
  const TenantClass = require('../models/TenantClass');
  const Student = require('../models/Student');
  const Guardian = require('../models/Guardian');
  const ChildGuardian = require('../models/ChildGuardian');
  const TenantAnnouncement = require('../models/TenantAnnouncement');
  const TenantCalendarEvent = require('../models/TenantCalendarEvent');
  const ChildHandoverEvent = require('../models/ChildHandoverEvent');
  const ChildHandoverState = require('../models/ChildHandoverState');
  const TenantWorkReport = require('../models/TenantWorkReport');
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
  let childId = null;
  let guardianId = null;

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, { token, organizationId, branchId, method = 'GET', body, query } = {}) {
    const url = new URL(path, 'http://127.0.0.1:' + server.address().port);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      }
    }
    const headers = {
      ...(token ? { 'x-auth-token': token } : {}),
      ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}),
      ...(branchId ? { 'x-branch-id': String(branchId) } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    const response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
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

  async function makeOrganization(owner, label) {
    const organization = await Organization.create({
      name: 'Test Preschool ' + label + ' ' + tag,
      slug: 'svc-' + label.toLowerCase() + '-' + tag,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      currency: 'INR',
      createdBy: owner._id,
      status: 'active',
    });
    organizationIds.push(organization._id);
    const branch = await Branch.create({
      organizationId: organization._id,
      name: 'Main ' + label,
      code: label.toUpperCase() + '-' + tag.slice(0, 5),
      timezone: 'Asia/Kolkata',
      createdBy: owner._id,
      status: 'active',
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
      guardianIds: options.guardianIds || [],
      classNames: options.classNames || [],
      accessAllBranches: options.accessAllBranches === true,
      status: 'active',
      activatedAt: new Date(),
    });
  }

  async function cleanUp() {
    if (organizationIds.length) {
      const organizationFilter = { organizationId: { $in: organizationIds } };
      await Promise.allSettled([
        TenantAnnouncement.deleteMany(organizationFilter),
        TenantCalendarEvent.deleteMany(organizationFilter),
        ChildHandoverEvent.deleteMany(organizationFilter),
        ChildHandoverState.deleteMany(organizationFilter),
        TenantWorkReport.deleteMany(organizationFilter),
        TenantClass.deleteMany(organizationFilter),
        ChildGuardian.deleteMany(organizationFilter),
        Guardian.deleteMany(organizationFilter),
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

  const ownerA = await makeUser('admin', 'owner-a');
  const ownerB = await makeUser('admin', 'owner-b');
  const teacherA = await makeUser('teacher', 'teacher-a');
  const parentA = await makeUser('student', 'parent-a');
  const tenantA = await makeOrganization(ownerA, 'Alpha');
  const tenantB = await makeOrganization(ownerB, 'Beta');

  await Promise.all([
    addMembership(ownerA, tenantA.organization, tenantA.branch, 'organization_owner', { accessAllBranches: true }),
    addMembership(ownerB, tenantB.organization, tenantB.branch, 'organization_owner', { accessAllBranches: true }),
  ]);

  await TenantClass.create({
    organizationId: tenantA.organization._id,
    branchId: tenantA.branch._id,
    name: 'Nursery',
    code: 'NUR',
    minAgeMonths: 24,
    maxAgeMonths: 48,
    defaultFeePaise: 100000,
    capacity: 30,
    feeFrequency: 'annual',
    createdBy: ownerA._id,
  });

  const child = await Student.create({
    firstName: 'Test',
    middleName: 'Service',
    lastName: 'Child',
    standard: 'Nursery',
    batchYear: '2026-2027',
    dob: '2023-06-01',
    stuNo: 'SVC-' + tag,
    organizationId: tenantA.organization._id,
    branchId: tenantA.branch._id,
    createdBy: ownerA._id,
  });
  childId = child._id;

  const guardian = await Guardian.create({
    organizationId: tenantA.organization._id,
    fullName: 'Test Parent ' + tag,
    email: 'guardian-' + tag + '@example.test',
    phone: '+919876543210',
    createdBy: ownerA._id,
  });
  guardianId = guardian._id;
  await ChildGuardian.create({
    organizationId: tenantA.organization._id,
    branchId: tenantA.branch._id,
    childId: child._id,
    guardianId: guardian._id,
    relationship: 'mother',
    isPrimaryContact: true,
    isBillingContact: true,
    isEmergencyContact: true,
    authorizedPickup: true,
    receivesSchoolUpdates: true,
    consent: { schoolCommunication: 'granted', photoUse: 'unknown', consentRecordedAt: new Date(), consentRecordedBy: ownerA._id },
    createdBy: ownerA._id,
  });

  await addMembership(teacherA, tenantA.organization, tenantA.branch, 'teacher', { classNames: ['Nursery'] });
  await addMembership(parentA, tenantA.organization, tenantA.branch, 'parent', { guardianIds: [guardian._id] });

  const ownerAToken = tokenFor(ownerA);
  const ownerBToken = tokenFor(ownerB);
  const teacherToken = tokenFor(teacherA);
  const parentToken = tokenFor(parentA);
  const a = { token: ownerAToken, organizationId: tenantA.organization._id, branchId: tenantA.branch._id };
  const b = { token: ownerBToken, organizationId: tenantB.organization._id, branchId: tenantB.branch._id };
  const teacher = { token: teacherToken, organizationId: tenantA.organization._id, branchId: tenantA.branch._id };
  const parent = { token: parentToken, organizationId: tenantA.organization._id, branchId: tenantA.branch._id };

  await t.test('notices respect role audience and organization scope', async () => {
    const created = await api('/api/saas/notices', {
      ...a,
      method: 'POST',
      body: {
        title: 'Staff safety briefing ' + tag,
        message: 'Please review the classroom and pickup safety checklist.',
        audience: 'staff',
        priority: 'important',
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const noticeId = created.data.announcement.id;

    const ownerList = await api('/api/saas/notices/manage', a);
    assert.equal(ownerList.status, 200);
    assert.ok(ownerList.data.some((notice) => notice.id === noticeId));

    const teacherList = await api('/api/saas/notices', teacher);
    assert.equal(teacherList.status, 200);
    assert.ok(teacherList.data.some((notice) => notice.id === noticeId));

    const parentList = await api('/api/saas/notices', parent);
    assert.equal(parentList.status, 200);
    assert.ok(parentList.data.every((notice) => notice.id !== noticeId));

    const otherOrganizationList = await api('/api/saas/notices/manage', b);
    assert.equal(otherOrganizationList.status, 200);
    assert.ok(otherOrganizationList.data.every((notice) => notice.id !== noticeId));

    const crossTenantEdit = await api('/api/saas/notices/' + noticeId, {
      ...b,
      method: 'PUT',
      body: { title: 'Changed across organizations', message: 'This must be denied.', audience: 'all', priority: 'normal' },
    });
    assert.equal(crossTenantEdit.status, 404);
  });

  await t.test('calendar events are branch-scoped, audience-filtered and audited', async () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const created = await api('/api/saas/calendar', {
      ...a,
      method: 'POST',
      body: {
        title: 'Family meeting ' + tag,
        description: 'A scheduled integration-test event.',
        type: 'meeting',
        audience: 'all',
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay: false,
        location: 'Main classroom',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const eventId = created.data.event.id;

    const ownerList = await api('/api/saas/calendar', a);
    assert.equal(ownerList.status, 200);
    assert.ok(ownerList.data.events.some((event) => event.id === eventId));

    const parentList = await api('/api/saas/calendar', parent);
    assert.equal(parentList.status, 200);
    assert.ok(parentList.data.events.some((event) => event.id === eventId));

    const otherList = await api('/api/saas/calendar', b);
    assert.equal(otherList.status, 200);
    assert.ok(otherList.data.events.every((event) => event.id !== eventId));

    const crossTenantCancel = await api('/api/saas/calendar/' + eventId + '/status', {
      ...b,
      method: 'PATCH',
      body: { status: 'cancelled', reason: 'cross-tenant test' },
    });
    assert.equal(crossTenantCancel.status, 404);
  });

  await t.test('arrival and pickup actions maintain presence state and keep family history private', async () => {
    const checkIn = await api('/api/saas/handover/check-in', {
      ...a,
      method: 'POST',
      body: { childId: String(child._id), method: 'family', guardianId: String(guardian._id), staffNote: 'Arrived with guardian.' },
    });
    assert.equal(checkIn.status, 201, JSON.stringify(checkIn.data));

    const duplicateCheckIn = await api('/api/saas/handover/check-in', {
      ...a,
      method: 'POST',
      body: { childId: String(child._id), method: 'family', guardianId: String(guardian._id) },
    });
    assert.equal(duplicateCheckIn.status, 409, JSON.stringify(duplicateCheckIn.data));

    const checkOut = await api('/api/saas/handover/check-out', {
      ...a,
      method: 'POST',
      body: { childId: String(child._id), guardianId: String(guardian._id), idChecked: true, staffNote: 'Authorized pickup checked.' },
    });
    assert.equal(checkOut.status, 201, JSON.stringify(checkOut.data));

    const state = await ChildHandoverState.findOne({
      organizationId: tenantA.organization._id,
      branchId: tenantA.branch._id,
      childId: child._id,
    }).lean();
    assert.equal(state.state, 'outside');

    const parentHistory = await api('/api/saas/handover', {
      ...parent,
      query: { from: localDateYmd(), to: localDateYmd() },
    });
    assert.equal(parentHistory.status, 200, JSON.stringify(parentHistory.data));
    assert.ok(parentHistory.data.events.length >= 2);
    assert.ok(parentHistory.data.events.every((event) => !Object.prototype.hasOwnProperty.call(event, 'staffNote')));

    const otherHistory = await api('/api/saas/handover', {
      ...b,
      query: { from: localDateYmd(), to: localDateYmd() },
    });
    assert.equal(otherHistory.status, 200, JSON.stringify(otherHistory.data));
    assert.equal(otherHistory.data.total, 0);
  });

  await t.test('teacher reports are class-scoped, reviewable, locked after review, and audited', async () => {
    const reportDate = localDateYmd();
    const created = await api('/api/saas/work-reports', {
      ...teacher,
      method: 'POST',
      body: {
        reportDate,
        className: 'Nursery',
        subject: 'Story time',
        startTime: '09:00',
        endTime: '09:30',
        workSummary: 'Read picture books and practiced basic shapes together.',
        studentsPresent: 1,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const reportId = created.data.report.id;

    const teacherList = await api('/api/saas/work-reports', teacher, { query: { from: reportDate, to: reportDate } });
    assert.equal(teacherList.status, 200);
    assert.ok(teacherList.data.reports.some((report) => report.id === reportId));

    const ownerBList = await api('/api/saas/work-reports', b, { query: { from: reportDate, to: reportDate } });
    assert.equal(ownerBList.status, 200);
    assert.ok(ownerBList.data.reports.every((report) => report.id !== reportId));

    const forbiddenReview = await api('/api/saas/work-reports/' + reportId + '/review', {
      ...teacher,
      method: 'PATCH',
      body: { status: 'reviewed', reviewNote: 'teacher cannot self-review' },
    });
    assert.equal(forbiddenReview.status, 403);

    const reviewed = await api('/api/saas/work-reports/' + reportId + '/review', {
      ...a,
      method: 'PATCH',
      body: { status: 'reviewed', reviewNote: 'Reviewed for the integration test.' },
    });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
    assert.equal(reviewed.data.report.status, 'reviewed');

    const lockedEdit = await api('/api/saas/work-reports/' + reportId, {
      ...teacher,
      method: 'PUT',
      body: {
        reportDate,
        className: 'Nursery',
        subject: 'Updated lesson',
        startTime: '09:00',
        endTime: '09:30',
        workSummary: 'Trying to change a report that has already been reviewed.',
        studentsPresent: 1,
      },
    });
    assert.equal(lockedEdit.status, 409);

    const auditActions = await AuditEvent.find({
      organizationId: tenantA.organization._id,
      action: { $in: ['tenant_notice.created', 'calendar_event.created', 'child_handover.check_in_completed', 'child_handover.check_out_completed', 'work_report.created', 'work_report.reviewed'] },
    }).distinct('action');
    for (const action of [
      'tenant_notice.created',
      'calendar_event.created',
      'child_handover.check_in_completed',
      'child_handover.check_out_completed',
      'work_report.created',
      'work_report.reviewed',
    ]) assert.ok(auditActions.includes(action), 'missing audit event: ' + action);
  });
});
