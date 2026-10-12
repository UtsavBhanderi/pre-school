'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canManageTenantNotices,
  canReadTenantNotices,
  audienceFilterForRole,
  validateTenantNoticeContent,
  validateTenantNoticeDates,
} = require('../utils/tenantNoticePolicy');

test('active staff and parent memberships can read notices but only administrators can manage them', () => {
  const owner = { role: 'organization_owner', status: 'active' };
  const teacher = { role: 'teacher', status: 'active' };
  const parent = { role: 'parent', status: 'active' };
  const suspendedAdmin = { role: 'branch_admin', status: 'suspended' };

  assert.equal(canReadTenantNotices(owner), true);
  assert.equal(canReadTenantNotices(teacher), true);
  assert.equal(canReadTenantNotices(parent), true);
  assert.equal(canReadTenantNotices(suspendedAdmin), false);
  assert.equal(canManageTenantNotices(owner), true);
  assert.equal(canManageTenantNotices({ role: 'branch_admin', status: 'active' }), true);
  assert.equal(canManageTenantNotices(teacher), false);
  assert.equal(canManageTenantNotices(parent), false);
});

test('parent notices are separated from staff-only notices', () => {
  assert.deepEqual(audienceFilterForRole('parent'), ['all', 'parents']);
  assert.deepEqual(audienceFilterForRole('teacher'), ['all', 'staff']);
  assert.deepEqual(audienceFilterForRole('accountant'), ['all', 'staff']);
  assert.deepEqual(audienceFilterForRole('unknown-role'), []);
});

test('notice content validator trims values and validates audience and priority', () => {
  assert.deepEqual(validateTenantNoticeContent({
    title: '  Holiday notice  ',
    message: '  School will be closed on Friday.  ',
    audience: 'parents',
    priority: 'important',
  }), {
    valid: true,
    title: 'Holiday notice',
    message: 'School will be closed on Friday.',
    audience: 'parents',
    priority: 'important',
  });
  assert.equal(validateTenantNoticeContent({ title: 'OK', message: 'Message' }).valid, false);
  assert.equal(validateTenantNoticeContent({ title: 'Valid title', message: '' }).valid, false);
  assert.equal(validateTenantNoticeContent({ title: 'Valid title', message: 'Message', audience: 'children' }).valid, false);
  assert.equal(validateTenantNoticeContent({ title: 'Valid title', message: 'Message', priority: 'critical' }).valid, false);
  assert.equal(validateTenantNoticeContent({ title: 'A'.repeat(121), message: 'Message' }).valid, false);
  assert.equal(validateTenantNoticeContent({ title: 'Valid title', message: 'x'.repeat(3001) }).valid, false);
});

test('notice schedule requires valid dates and an end after the start', () => {
  const scheduled = validateTenantNoticeDates('2026-10-20T09:00:00.000Z', '2026-10-20T11:00:00.000Z');
  assert.equal(scheduled.valid, true);
  assert.equal(scheduled.startsAt.toISOString(), '2026-10-20T09:00:00.000Z');
  assert.equal(scheduled.expiresAt.toISOString(), '2026-10-20T11:00:00.000Z');

  assert.equal(validateTenantNoticeDates('invalid-date', null).valid, false);
  assert.equal(validateTenantNoticeDates('2026-10-20T11:00:00.000Z', '2026-10-20T09:00:00.000Z').valid, false);
  assert.equal(validateTenantNoticeDates('2026-10-20T09:00:00.000Z', '').expiresAt, null);
});
