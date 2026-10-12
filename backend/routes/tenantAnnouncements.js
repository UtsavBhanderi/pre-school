'use strict';

const express = require('express');
const mongoose = require('mongoose');
const TenantAnnouncement = require('../models/TenantAnnouncement');
const Branch = require('../models/Branch');
const ChildGuardian = require('../models/ChildGuardian');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const {
  canManageTenantNotices,
  canReadTenantNotices,
  audienceFilterForRole,
  validateTenantNoticeContent,
  validateTenantNoticeDates,
} = require('../utils/tenantNoticePolicy');

const router = express.Router();
router.use(tenantContext);

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function parseNoticeDates(body, existing = {}) {
  const rawStart = body.startsAt === undefined ? existing.startsAt : body.startsAt;
  const rawEnd = body.expiresAt === undefined ? existing.expiresAt : body.expiresAt;
  return validateTenantNoticeDates(rawStart, rawEnd);
}

function validateContent(body, existing = {}) {
  const result = validateTenantNoticeContent({
    title: body.title === undefined ? existing.title : body.title,
    message: body.message === undefined ? existing.message : body.message,
    audience: body.audience === undefined ? (existing.audience || 'all') : body.audience,
    priority: body.priority === undefined ? (existing.priority || 'normal') : body.priority,
  });
  if (!result.valid) return result;
  const { valid, ...value } = result;
  return { valid: true, value };
}

async function visibleBranchIds(req) {
  if (req.tenant.branch) return [req.tenant.branch._id];
  const membership = req.tenant.membership;
  if (membership.accessAllBranches) {
    const branches = await Branch.find({
      organizationId: req.tenant.organization._id,
      status: 'active',
    }).select('_id').lean();
    return branches.map((branch) => branch._id);
  }
  return (membership.branchIds || []).map((id) => id?._id || id);
}

async function readableBranchIds(req) {
  const allowed = await visibleBranchIds(req);
  if (req.tenant.membership.role !== 'parent') return allowed;
  const guardianIds = req.tenant.membership.guardianIds || [];
  if (!guardianIds.length) return [];
  const links = await ChildGuardian.find({
    organizationId: req.tenant.organization._id,
    branchId: { $in: allowed },
    guardianId: { $in: guardianIds },
  }).select('branchId').lean();
  const linked = new Set(links.map((link) => String(link.branchId)));
  return allowed.filter((id) => linked.has(String(id)));
}

function audienceFilter(req) {
  return { $in: audienceFilterForRole(req.tenant.membership.role) };
}

function serialize(notice) {
  return {
    id: String(notice._id),
    title: notice.title,
    message: notice.message,
    audience: notice.audience,
    priority: notice.priority,
    startsAt: notice.startsAt,
    expiresAt: notice.expiresAt,
    status: notice.status,
    branch: notice.branchId ? {
      id: String(notice.branchId._id || notice.branchId),
      name: notice.branchId.name || '',
      code: notice.branchId.code || '',
    } : null,
    createdBy: notice.createdBy ? {
      id: String(notice.createdBy._id || notice.createdBy),
      name: notice.createdBy.username || notice.createdByName || '',
    } : null,
    createdAt: notice.createdAt,
    updatedAt: notice.updatedAt,
  };
}

async function auditNotice(req, session, notice, action, reason = '') {
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: notice.branchId,
    actorUserId: req.user._id,
    action,
    resourceType: 'tenant_announcement',
    resourceId: String(notice._id),
    outcome: 'success',
    reason: clean(reason, 500),
    summary: action === 'tenant_notice.created'
      ? 'School notice created: ' + notice.title + '.'
      : action === 'tenant_notice.archived'
        ? 'School notice archived: ' + notice.title + '.'
        : 'School notice updated: ' + notice.title + '.',
    changedFields: action === 'tenant_notice.created'
      ? ['title', 'message', 'audience', 'priority', 'startsAt', 'expiresAt']
      : action === 'tenant_notice.archived'
        ? ['status']
        : ['title', 'message', 'audience', 'priority', 'startsAt', 'expiresAt'],
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], { session });
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

// Current notices: every result is restricted to the selected organization and branches the caller can see.
router.get('/', async (req, res) => {
  if (!canReadTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'You do not have access to school notices.' });
  }
  if (req.tenant.membership.role === 'parent' &&
      (!Array.isArray(req.tenant.membership.guardianIds) || !req.tenant.membership.guardianIds.length)) {
    return res.status(403).json({ message: 'This parent account has no verified family link.' });
  }
  try {
    const branchIds = await readableBranchIds(req);
    if (!branchIds.length) return res.json([]);
    const now = new Date();
    const notices = await TenantAnnouncement.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
      status: 'active',
      startsAt: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
      audience: audienceFilter(req),
    })
      .populate({ path: 'branchId', select: 'name code' })
      .sort({ priority: -1, startsAt: -1, createdAt: -1 })
      .limit(200)
      .lean();
    return res.json(notices.map(serialize));
  } catch (error) {
    console.error('Unable to load tenant school notices:', error.message);
    return res.status(503).json({ message: 'School notices could not be loaded.' });
  }
});

// Admin view includes future, expired and archived notices for every branch within the caller's scope.
router.get('/manage', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can manage notices.' });
  }
  try {
    const branchIds = await visibleBranchIds(req);
    if (!branchIds.length) return res.json([]);
    const notices = await TenantAnnouncement.find({
      organizationId: req.tenant.organization._id,
      branchId: { $in: branchIds },
    })
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'createdBy', select: 'username' })
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();
    return res.json(notices.map(serialize));
  } catch (error) {
    console.error('Unable to load tenant notice management list:', error.message);
    return res.status(503).json({ message: 'Notices could not be loaded for management.' });
  }
});

router.post('/', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can publish notices.' });
  }
  if (!req.tenant.branch) return res.status(400).json({ message: 'Choose the branch this notice belongs to.' });
  const content = validateContent(req.body || {});
  if (!content.valid) return res.status(400).json({ message: content.message });
  const dates = parseNoticeDates(req.body || {});
  if (!dates.valid) return res.status(400).json({ message: dates.message });
  const reason = clean(req.body?.reason, 500);
  try {
    const notice = await withTransaction(async (session) => {
      const [created] = await TenantAnnouncement.create([{
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        ...content.value,
        startsAt: dates.startsAt,
        expiresAt: dates.expiresAt,
        status: 'active',
        createdBy: req.user._id,
      }], { session });
      await auditNotice(req, session, created, 'tenant_notice.created', reason);
      return created;
    });
    return res.status(201).json({ message: 'School notice published.', announcement: serialize(notice) });
  } catch (error) {
    console.error('Unable to publish tenant notice:', error.message);
    return res.status(503).json({ message: 'Notice could not be published safely.' });
  }
});

router.put('/:id', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can edit notices.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid notice.' });
  const content = validateContent(req.body || {});
  if (!content.valid) return res.status(400).json({ message: content.message });
  const dates = parseNoticeDates(req.body || {});
  if (!dates.valid) return res.status(400).json({ message: dates.message });
  const reason = clean(req.body?.reason, 500);
  try {
    const updated = await withTransaction(async (session) => {
      const notice = await TenantAnnouncement.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: { $in: await visibleBranchIds(req) },
      }).session(session);
      if (!notice) {
        const missing = new Error('Notice not found in the branches you can manage.');
        missing.code = 'NOTICE_NOT_FOUND';
        throw missing;
      }
      Object.assign(notice, content.value, { startsAt: dates.startsAt, expiresAt: dates.expiresAt, updatedBy: req.user._id });
      await notice.save({ session });
      await auditNotice(req, session, notice, 'tenant_notice.updated', reason);
      return notice;
    });
    return res.json({ message: 'School notice updated.', announcement: serialize(updated) });
  } catch (error) {
    if (error.code === 'NOTICE_NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update tenant notice:', error.message);
    return res.status(503).json({ message: 'Notice could not be updated safely.' });
  }
});

router.patch('/:id/status', async (req, res) => {
  if (!canManageTenantNotices(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an authorized school administrator can archive notices.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid notice.' });
  const status = clean(req.body?.status, 20);
  if (!['active', 'archived'].includes(status)) return res.status(400).json({ message: 'Choose Active or Archived.' });
  const reason = clean(req.body?.reason, 500);
  try {
    const result = await withTransaction(async (session) => {
      const notice = await TenantAnnouncement.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: { $in: await visibleBranchIds(req) },
      }).session(session);
      if (!notice) {
        const missing = new Error('Notice not found in the branches you can manage.');
        missing.code = 'NOTICE_NOT_FOUND';
        throw missing;
      }
      notice.status = status;
      notice.updatedBy = req.user._id;
      await notice.save({ session });
      await auditNotice(req, session, notice, status === 'archived' ? 'tenant_notice.archived' : 'tenant_notice.updated', reason);
      return notice;
    });
    return res.json({ message: status === 'archived' ? 'Notice archived.' : 'Notice restored.', announcement: serialize(result) });
  } catch (error) {
    if (error.code === 'NOTICE_NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to update tenant notice status:', error.message);
    return res.status(503).json({ message: 'Notice status could not be updated safely.' });
  }
});

module.exports = router;
