'use strict';

const ADMIN_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin'];
const STAFF_ROLES = [
  'organization_owner', 'head_office_admin', 'branch_admin',
  'admissions', 'teacher', 'accountant', 'hr_manager', 'transport_staff',
];
const NOTICE_AUDIENCES = ['all', 'staff', 'parents'];
const NOTICE_PRIORITIES = ['normal', 'important', 'urgent'];

function canManageTenantNotices(membership) {
  return Boolean(membership && membership.status === 'active' && ADMIN_ROLES.includes(membership.role));
}

function canReadTenantNotices(membership) {
  return Boolean(membership && membership.status === 'active' &&
    (STAFF_ROLES.includes(membership.role) || membership.role === 'parent'));
}

function audienceFilterForRole(role) {
  if (role === 'parent') return ['all', 'parents'];
  if (STAFF_ROLES.includes(role)) return ['all', 'staff'];
  return [];
}

function validateTenantNoticeContent({ title, message, audience = 'all', priority = 'normal' } = {}) {
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  if (cleanTitle.length < 3 || cleanTitle.length > 120) {
    return { valid: false, message: 'Notice title must contain 3 to 120 characters.' };
  }
  if (cleanMessage.length < 1 || cleanMessage.length > 3000) {
    return { valid: false, message: 'Notice message must contain 1 to 3000 characters.' };
  }
  if (!NOTICE_AUDIENCES.includes(audience)) {
    return { valid: false, message: 'Choose Staff, Parents, or Everyone as the audience.' };
  }
  if (!NOTICE_PRIORITIES.includes(priority)) {
    return { valid: false, message: 'Choose a valid notice priority.' };
  }
  return {
    valid: true,
    title: cleanTitle,
    message: cleanMessage,
    audience,
    priority,
  };
}

function validateTenantNoticeDates(startsAt, expiresAt) {
  const start = startsAt ? new Date(startsAt) : new Date();
  const end = expiresAt ? new Date(expiresAt) : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())) || (end && end <= start)) {
    return { valid: false, message: 'Check the notice start and end dates. The end must be after the start.' };
  }
  return { valid: true, startsAt: start, expiresAt: end };
}

module.exports = {
  ADMIN_ROLES,
  STAFF_ROLES,
  NOTICE_AUDIENCES,
  NOTICE_PRIORITIES,
  canManageTenantNotices,
  canReadTenantNotices,
  audienceFilterForRole,
  validateTenantNoticeContent,
  validateTenantNoticeDates,
};
